import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import WebSocket from "ws";
import type { LogMessage, InputMessage } from "../process-manager.js";
import type { AgentWsInput } from "../agent-types.js";
import type { RemoteSessionInfo } from "../server-types.js";
import "../server-types.js";

/** Build a WebSocket URL for a remote agent session. */
function buildRemoteWsUrl(remoteInfo: RemoteSessionInfo): string {
  const cleanRemoteUrl = remoteInfo.remoteUrl.replace(/\/+$/, "");
  const wsProtocol = cleanRemoteUrl.startsWith("https") ? "wss" : "ws";
  const wsUrl = cleanRemoteUrl.replace(/^https?/, wsProtocol);
  return `${wsUrl}/api/agent-sessions/${remoteInfo.remoteSessionId}/stream?apiKey=${encodeURIComponent(remoteInfo.remoteApiKey)}`;
}

/** Try to parse a raw WS message string, returning undefined on failure. */
function tryParseWsMessage(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

const routes: FastifyPluginAsync = async (fastify) => {
  // WebSocket routes must be registered after the websocket plugin is ready
  fastify.after(() => {
    // Executor process logs WebSocket
    fastify.get<{ Params: { processId: string } }>(
      "/api/executor-processes/:processId/logs",
      { websocket: true },
      (socket, req) => {
        const { processId } = req.params;

        console.log(`[WebSocket] Client connected for process ${processId}`);

        // Remote executor process proxy
        if (processId.startsWith("remote-")) {
          const remoteInfo = fastify.remoteExecutorMap.get(processId);
          if (!remoteInfo) {
            console.log(`[WebSocket] Remote process ${processId} not found in map`);
            socket.send(JSON.stringify({ type: "error", message: "Remote process not found" }));
            socket.close();
            return;
          }

          const cleanRemoteUrl = remoteInfo.remoteUrl.replace(/\/+$/, "");
          const wsProtocol = cleanRemoteUrl.startsWith("https") ? "wss" : "ws";
          const wsUrl = cleanRemoteUrl.replace(/^https?/, wsProtocol);
          const remoteWsUrl = `${wsUrl}/api/executor-processes/${remoteInfo.remoteProcessId}/logs?apiKey=${encodeURIComponent(remoteInfo.remoteApiKey)}`;

          console.log(`[WebSocket] Proxying to remote: ${remoteWsUrl.replace(remoteInfo.remoteApiKey, "***")}`);

          const remoteWs = new WebSocket(remoteWsUrl, undefined, fastify.proxyManager.getWsOptions());

          remoteWs.on("open", () => {
            console.log(`[WebSocket] Connected to remote process ${remoteInfo.remoteProcessId}`);
          });

          remoteWs.on("message", (data) => {
            try {
              socket.send(data.toString());
            } catch (error) {
              console.error("[WebSocket] Failed to forward message to client:", error);
            }
          });

          socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
            try {
              if (remoteWs.readyState === WebSocket.OPEN) {
                remoteWs.send(data.toString());
              }
            } catch (error) {
              console.error("[WebSocket] Failed to forward message to remote:", error);
            }
          });

          remoteWs.on("close", () => {
            console.log(`[WebSocket] Remote connection closed for process ${processId}`);
            socket.close();
          });

          remoteWs.on("error", (error) => {
            console.error(`[WebSocket] Remote connection error:`, error);
            socket.send(JSON.stringify({ type: "error", message: "Remote connection error" }));
            socket.close();
          });

          socket.on("close", () => {
            console.log(`[WebSocket] Client disconnected from remote process ${processId}`);
            remoteWs.close();
          });

          return;
        }

        // Local process handling
        const isPty = fastify.processManager.isPtyProcess(processId);
        socket.send(JSON.stringify({ type: "init", isPty }));

        const logs = fastify.processManager.getLogs(processId);
        console.log(`[WebSocket] Sending ${logs.length} historical logs`);
        for (const log of logs) {
          socket.send(JSON.stringify(log));
        }

        const isRunning = fastify.processManager.isRunning(processId);
        console.log(`[WebSocket] Process running: ${isRunning}`);

        if (logs.length === 0 && !isRunning) {
          console.log(`[WebSocket] Process not found or no logs, closing connection`);
          socket.send(JSON.stringify({ type: "error", message: "Process not found" }));
          socket.close();
          return;
        }

        const lastLog = logs[logs.length - 1];
        if (lastLog?.type === "finished") {
          socket.close();
          return;
        }

        const unsubscribe = fastify.processManager.subscribe(processId, (msg: LogMessage) => {
          try {
            socket.send(JSON.stringify(msg));
            if (msg.type === "finished") {
              socket.close();
            }
          } catch (error) {
            unsubscribe?.();
          }
        });

        socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as InputMessage;
            if (message.type === "input" || message.type === "resize") {
              fastify.processManager.handleInput(processId, message);
            }
          } catch (error) {
            console.error("[WebSocket] Failed to parse input message:", error);
          }
        });

        socket.on("close", () => {
          unsubscribe?.();
        });
      }
    );

    // Agent Session WebSocket
    fastify.get<{ Params: { sessionId: string }; Querystring: { apiKey?: string } }>(
      "/api/agent-sessions/:sessionId/stream",
      { websocket: true },
      (socket, req) => {
        const { sessionId } = req.params;

        console.log(`[AgentWS] Client connected for session ${sessionId}`);

        // Ping/pong keepalive to prevent idle disconnections (code 1005)
        const pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.ping();
          }
        }, 30000); // Ping every 30 seconds

        if (sessionId.startsWith("remote-")) {
          const remoteInfo = fastify.remoteSessionMap.get(sessionId);
          if (!remoteInfo) {
            console.log(`[AgentWS] Remote session ${sessionId} not found in map`);
            socket.send(JSON.stringify({ type: "error", message: "Remote session not found" }));
            socket.close();
            return;
          }

          const cache = fastify.remotePatchCache;
          const cacheEntry = cache.getOrCreate(sessionId);

          // --- Phase 1: Replay cached data to this frontend ---
          if (cacheEntry.messages.length > 0) {
            console.log(`[AgentWS] Replaying ${cacheEntry.messages.length} cached msgs for ${sessionId}`);
            for (const raw of cacheEntry.messages) {
              try { socket.send(raw); } catch { /* client gone */ }
            }
            try { socket.send(JSON.stringify({ Ready: true })); } catch { /* client gone */ }

            if (cacheEntry.finished) {
              try { socket.send(JSON.stringify({ finished: true })); } catch { /* noop */ }
              cache.addSubscriber(sessionId, socket);
              socket.on("close", () => {
                clearInterval(pingInterval);
                cache.removeSubscriber(sessionId, socket);
              });
              return;
            }
          }

          // --- Phase 2: Ensure persistent remote WS ---
          cache.addSubscriber(sessionId, socket);

          // Shared sync state — accessible from both remote WS and frontend socket handlers.
          // `syncing` is true while the remote replays its history; user messages are buffered.
          const syncState = { syncing: false, pendingUserMessages: [] as string[] };

          const existingRemoteWs = cache.getRemoteWs(sessionId);
          if (!existingRemoteWs) {
            // Need to open a new persistent remote WS
            const remoteWsUrl = buildRemoteWsUrl(remoteInfo);
            const hasCachedData = cacheEntry.messages.length > 0;
            console.log(`[AgentWS] Opening persistent remote WS for ${sessionId} (cached=${hasCachedData})`);
            const remoteWs = new WebSocket(remoteWsUrl, undefined, fastify.proxyManager.getWsOptions());
            cache.setRemoteWs(sessionId, remoteWs);

            /** Live-mode message handler — shared by both first-connect and post-sync paths. */
            const handleLiveMessage = (data: import("ws").RawData) => {
              const raw = data.toString();
              const parsed = tryParseWsMessage(raw);
              if (!parsed) return;

              if ("JsonPatch" in parsed) {
                cache.appendMessage(sessionId, raw, true);
                cache.broadcast(sessionId, raw);
              } else if ("finished" in parsed) {
                cache.setFinished(sessionId);
                cache.broadcast(sessionId, raw);
              } else if ("taskCompleted" in parsed || "error" in parsed) {
                cache.appendMessage(sessionId, raw, false);
                cache.broadcast(sessionId, raw);
              } else if ("Ready" in parsed) {
                cache.broadcast(sessionId, raw);
              }
            };

            remoteWs.on("open", () => {
              console.log(`[AgentWS] Persistent remote WS connected for ${sessionId} (sync=${hasCachedData})`);
            });

            if (!hasCachedData) {
              // First connection ever — stream directly in live mode
              remoteWs.on("message", handleLiveMessage);
            } else {
              // Has cached data but persistent WS died — need sync first
              syncState.syncing = true;
              const replayBuffer: string[] = [];

              remoteWs.on("message", (data) => {
                const raw = data.toString();
                const parsed = tryParseWsMessage(raw);
                if (!parsed) return;

                if (!syncState.syncing) {
                  // Already switched to live — shouldn't happen, but handle gracefully
                  handleLiveMessage(data);
                  return;
                }

                if ("Ready" in parsed) {
                  // Remote finished replay — reconcile
                  syncState.syncing = false;
                  const currentEntry = cache.get(sessionId)!;
                  const cachedMsgCount = currentEntry.messages.length;

                  if (replayBuffer.length > cachedMsgCount) {
                    // Remote has newer data — send delta + update cache
                    const delta = replayBuffer.slice(cachedMsgCount);
                    console.log(`[AgentWS] Sync delta: ${delta.length} new msgs for ${sessionId}`);
                    for (const msg of delta) {
                      const p = tryParseWsMessage(msg);
                      cache.appendMessage(sessionId, msg, !!(p && "JsonPatch" in p));
                      cache.broadcast(sessionId, msg);
                    }
                  } else if (replayBuffer.length < cachedMsgCount) {
                    // Cache is stale (session was restarted remotely) — full replace
                    console.log(`[AgentWS] Sync stale cache for ${sessionId}: remote=${replayBuffer.length}, cached=${cachedMsgCount}`);
                    let newPatchCount = 0;
                    for (const msg of replayBuffer) {
                      const p = tryParseWsMessage(msg);
                      if (p && "JsonPatch" in p) newPatchCount++;
                    }
                    cache.replaceAll(sessionId, [...replayBuffer], newPatchCount);
                    // Tell frontends to clear and re-render
                    const clearPatch = {
                      JsonPatch: [{
                        op: "replace",
                        path: "/entries",
                        value: { type: "ENTRY", content: { type: "system", content: "__CLEAR_ALL__", timestamp: Date.now() } },
                      }],
                    };
                    cache.broadcast(sessionId, JSON.stringify(clearPatch));
                    for (const msg of replayBuffer) {
                      cache.broadcast(sessionId, msg);
                    }
                    cache.broadcast(sessionId, JSON.stringify({ Ready: true }));
                  }
                  // else equal — cache is current, nothing to send

                  // Flush user messages buffered during sync
                  for (const userMsg of syncState.pendingUserMessages) {
                    try {
                      if (remoteWs.readyState === WebSocket.OPEN) {
                        remoteWs.send(userMsg);
                      }
                    } catch { break; }
                  }
                  syncState.pendingUserMessages.length = 0;

                  // Switch to live-mode handler
                  remoteWs.removeAllListeners("message");
                  remoteWs.on("message", handleLiveMessage);
                  return;
                }

                // Buffer history messages during sync (bug 4 fix: don't buffer "finished")
                if ("JsonPatch" in parsed || "taskCompleted" in parsed || "error" in parsed) {
                  replayBuffer.push(raw);
                }
                if ("finished" in parsed) {
                  cache.setFinished(sessionId);
                }
              });
            }

            // Persistent remote WS lifecycle handlers (set once)
            remoteWs.on("close", () => {
              console.log(`[AgentWS] Persistent remote WS closed for ${sessionId}`);
              cache.setRemoteWs(sessionId, null);
            });

            remoteWs.on("error", (error) => {
              console.error(`[AgentWS] Persistent remote WS error for ${sessionId}:`, error);
              try {
                cache.broadcast(sessionId, JSON.stringify({ error: "Remote connection error" }));
              } catch { /* noop */ }
              cache.setRemoteWs(sessionId, null);
            });
          }

          // --- Phase 3: Set up frontend socket handlers ---
          socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
            const userMsg = data.toString();
            if (syncState.syncing) {
              syncState.pendingUserMessages.push(userMsg);
              return;
            }
            try {
              const rws = cache.getRemoteWs(sessionId);
              if (rws) rws.send(userMsg);
            } catch (error) {
              console.error("[AgentWS] Failed to forward message to remote:", error);
            }
          });

          socket.on("close", () => {
            console.log(`[AgentWS] Client disconnected from remote session ${sessionId}`);
            clearInterval(pingInterval);
            cache.removeSubscriber(sessionId, socket);
            // Do NOT close persistent remote WS
          });

          return;
        }

        // Local session handling
        const unsubscribe = fastify.agentSessionManager.subscribe(sessionId, socket);

        if (!unsubscribe) {
          console.log(`[AgentWS] Session ${sessionId} not found`);
          clearInterval(pingInterval);
          socket.send(JSON.stringify({ error: "Session not found" }));
          socket.close();
          return;
        }

        socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as AgentWsInput;
            if (message.type === "user_message") {
              fastify.agentSessionManager.sendUserMessage(sessionId, message.content);
            }
          } catch (error) {
            console.error("[AgentWS] Failed to parse message:", error);
          }
        });

        socket.on("close", () => {
          console.log(`[AgentWS] Client disconnected from session ${sessionId}`);
          clearInterval(pingInterval);
          unsubscribe?.();
        });
      }
    );
  });
};

export default fp(routes, { name: "websocket-routes" });

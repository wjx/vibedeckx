import type { AgentSessionStatus } from "../conversation-patch.js";
import type { GlobalEvent } from "../event-bus.js";
import type { RemoteSessionInfo } from "../server-types.js";

/**
 * Extract the projectId from a synthetic remote session id.
 *
 * Remote session ids are formatted `remote-{serverId}-{projectId}-{sessionId}`.
 * The serverId and sessionId are known from `remoteInfo`, so we strip the
 * known prefix/suffix. Falls back to a heuristic split for malformed ids.
 *
 * Single source of truth for this slicing. Both the status-bridge and the
 * taskCompleted-bridge in `websocket-routes.ts` call this helper.
 */
export function projectIdFromRemoteSessionId(
  sessionId: string,
  remoteInfo: RemoteSessionInfo,
): string {
  const prefix = `remote-${remoteInfo.remoteServerId}-`;
  const suffix = `-${remoteInfo.remoteSessionId}`;
  if (sessionId.startsWith(prefix) && sessionId.endsWith(suffix)) {
    return sessionId.slice(prefix.length, sessionId.length - suffix.length);
  }
  return sessionId.split("-").slice(2, -1).join("-");
}

/**
 * Tracks the most-recent status emitted to the local EventBus for each remote
 * session. Used to suppress no-op status emissions — notably the trailing
 * status patch that the remote's `subscribe()` sends to every fresh subscriber
 * (which would otherwise re-emit "running" on every persistent-WS reconnect or
 * on a brand-new idle session and incorrectly turn the workspace dot blue).
 */
const lastEmittedStatusBySession = new Map<string, AgentSessionStatus>();

/** Test hook — clears tracked state. */
export function _resetRemoteStatusTracker(): void {
  lastEmittedStatusBySession.clear();
}

/**
 * If `parsed` is a JsonPatch message from a remote agent session that
 * contains a `/status` op with a valid status string, return the
 * `session:status` event payload to emit on the local EventBus.
 *
 * Returns `null` when:
 * - the message does not carry a status update
 * - this is the first status patch we've seen for the session (treated as
 *   "initial state" rather than a transition — the remote `subscribe()`
 *   handshake always sends a trailing status patch even when the session is
 *   idle, which would otherwise turn the workspace dot blue on every fresh
 *   New Conversation or persistent-WS reconnect)
 * - the status matches what we last recorded for this session
 *
 * Polling (`useSessionStatuses`, every 30s with the entry_count=0 filter)
 * provides the absolute current state, so suppressing the initial event is
 * safe — we only delay realtime feedback for whatever state the remote was
 * already in when we first observed it.
 */
export function statusEventFromRemotePatch(
  parsed: Record<string, unknown>,
  sessionId: string,
  remoteInfo: RemoteSessionInfo,
): Extract<GlobalEvent, { type: "session:status" }> | null {
  if (!("JsonPatch" in parsed)) return null;
  const ops = parsed.JsonPatch;
  if (!Array.isArray(ops)) return null;
  const statusOp = (ops as Array<{
    op: string;
    path: string;
    value?: { type?: string; content?: unknown };
  }>).find((o) => o.path === "/status");
  if (!statusOp) return null;
  const content = statusOp.value?.content;
  if (content !== "running" && content !== "stopped" && content !== "error") {
    return null;
  }
  const prev = lastEmittedStatusBySession.get(sessionId);
  lastEmittedStatusBySession.set(sessionId, content);
  if (prev === undefined || prev === content) {
    return null;
  }
  return {
    type: "session:status",
    projectId: projectIdFromRemoteSessionId(sessionId, remoteInfo),
    branch: remoteInfo.branch ?? null,
    sessionId,
    status: content as AgentSessionStatus,
  };
}

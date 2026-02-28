/**
 * In-memory cache for remote agent session WebSocket messages.
 *
 * Stores the raw serialized WS messages that flow through the proxy so that
 * returning to a previously-visited remote workspace can replay history from
 * local memory instead of re-fetching everything from the remote server.
 *
 * Also manages persistent remote WebSocket connections and frontend subscriber
 * tracking so that remote output is always cached even when no frontend is
 * connected.
 */

import type WebSocket from "ws";

export interface CacheEntry {
  /** Raw serialized WS messages (JsonPatch, taskCompleted, error, etc.) */
  messages: string[];
  /** Count of JsonPatch messages only */
  patchCount: number;
  /** Whether the remote sent { finished: true } */
  finished: boolean;
  /** Persistent WebSocket connection to the remote server (null if not connected) */
  remoteWs: WebSocket | null;
  /** Set of frontend WebSocket connections subscribed to this session */
  subscribers: Set<WebSocket>;
}

export class RemotePatchCache {
  private cache = new Map<string, CacheEntry>();

  getOrCreate(sessionId: string): CacheEntry {
    let entry = this.cache.get(sessionId);
    if (!entry) {
      entry = {
        messages: [],
        patchCount: 0,
        finished: false,
        remoteWs: null,
        subscribers: new Set(),
      };
      this.cache.set(sessionId, entry);
    }
    return entry;
  }

  get(sessionId: string): CacheEntry | undefined {
    return this.cache.get(sessionId);
  }

  hasData(sessionId: string): boolean {
    const entry = this.cache.get(sessionId);
    return !!entry && entry.messages.length > 0;
  }

  /**
   * Append a raw WS message to the cache.
   * @param raw - The serialized message string
   * @param isJsonPatch - Whether this message is a JsonPatch (increments patchCount)
   */
  appendMessage(sessionId: string, raw: string, isJsonPatch: boolean): void {
    const entry = this.getOrCreate(sessionId);
    entry.messages.push(raw);
    if (isJsonPatch) {
      entry.patchCount++;
    }
  }

  /** Full cache replacement (used when cache is detected as stale). */
  replaceAll(sessionId: string, messages: string[], patchCount: number): void {
    const existing = this.cache.get(sessionId);
    // Preserve persistent WS and subscribers across cache replacement
    const remoteWs = existing?.remoteWs ?? null;
    const subscribers = existing?.subscribers ?? new Set<WebSocket>();
    this.cache.set(sessionId, {
      messages,
      patchCount,
      finished: false,
      remoteWs,
      subscribers,
    });
  }

  setFinished(sessionId: string): void {
    const entry = this.cache.get(sessionId);
    if (entry) {
      entry.finished = true;
    }
  }

  /** Store a persistent remote WebSocket connection. */
  setRemoteWs(sessionId: string, ws: WebSocket | null): void {
    const entry = this.getOrCreate(sessionId);
    entry.remoteWs = ws;
  }

  /** Get the persistent remote WS if it exists and is open. */
  getRemoteWs(sessionId: string): WebSocket | null {
    const entry = this.cache.get(sessionId);
    if (!entry?.remoteWs) return null;
    // WebSocket.OPEN === 1
    if (entry.remoteWs.readyState !== 1) {
      entry.remoteWs = null;
      return null;
    }
    return entry.remoteWs;
  }

  /** Add a frontend WebSocket as a subscriber. */
  addSubscriber(sessionId: string, frontendWs: WebSocket): void {
    const entry = this.getOrCreate(sessionId);
    entry.subscribers.add(frontendWs);
  }

  /** Remove a frontend WebSocket subscriber. */
  removeSubscriber(sessionId: string, frontendWs: WebSocket): void {
    const entry = this.cache.get(sessionId);
    if (entry) {
      entry.subscribers.delete(frontendWs);
    }
  }

  /** Broadcast a raw message to all subscribers, auto-removing dead ones. */
  broadcast(sessionId: string, raw: string): void {
    const entry = this.cache.get(sessionId);
    if (!entry) return;
    for (const ws of entry.subscribers) {
      try {
        ws.send(raw);
      } catch {
        entry.subscribers.delete(ws);
      }
    }
  }

  delete(sessionId: string): void {
    const entry = this.cache.get(sessionId);
    if (entry) {
      // Close persistent remote WS if open
      if (entry.remoteWs) {
        try {
          entry.remoteWs.close();
        } catch { /* ignore */ }
      }
    }
    this.cache.delete(sessionId);
  }
}

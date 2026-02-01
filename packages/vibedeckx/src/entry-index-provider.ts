/**
 * EntryIndexProvider - Provides monotonically increasing indices for entries
 * Matches vibe-kanban's pattern for thread-safe index management
 */

/**
 * Provides unique, monotonically increasing indices for conversation entries.
 * Can be cloned to share the same counter across multiple processors.
 */
export class EntryIndexProvider {
  private currentIndex: number;

  constructor(startAt: number = 0) {
    this.currentIndex = startAt;
  }

  /**
   * Get the next available index (increments the counter)
   */
  next(): number {
    return this.currentIndex++;
  }

  /**
   * Get the current index without incrementing
   */
  current(): number {
    return this.currentIndex;
  }

  /**
   * Reset the counter to 0
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Set the counter to a specific value
   */
  setIndex(index: number): void {
    this.currentIndex = index;
  }

  /**
   * Clone the provider (shares nothing - creates independent copy)
   * For shared state, use the same instance directly
   */
  clone(): EntryIndexProvider {
    return new EntryIndexProvider(this.currentIndex);
  }
}

/**
 * Tracks which message index corresponds to which entry index.
 * Useful for tracking the last assistant message for streaming updates.
 */
export class EntryTracker {
  private entryIndices: Map<string, number> = new Map();
  private indexProvider: EntryIndexProvider;

  constructor(indexProvider: EntryIndexProvider) {
    this.indexProvider = indexProvider;
  }

  /**
   * Get or create an entry index for a given key.
   * Returns { index, isNew } to indicate if this is a new entry.
   */
  getOrCreate(key: string): { index: number; isNew: boolean } {
    const existing = this.entryIndices.get(key);
    if (existing !== undefined) {
      return { index: existing, isNew: false };
    }

    const newIndex = this.indexProvider.next();
    this.entryIndices.set(key, newIndex);
    return { index: newIndex, isNew: true };
  }

  /**
   * Get the entry index for a key, or undefined if not tracked
   */
  get(key: string): number | undefined {
    return this.entryIndices.get(key);
  }

  /**
   * Check if a key is being tracked
   */
  has(key: string): boolean {
    return this.entryIndices.has(key);
  }

  /**
   * Remove tracking for a key
   */
  remove(key: string): boolean {
    return this.entryIndices.delete(key);
  }

  /**
   * Clear all tracked entries
   */
  clear(): void {
    this.entryIndices.clear();
  }

  /**
   * Get the underlying index provider
   */
  getProvider(): EntryIndexProvider {
    return this.indexProvider;
  }
}

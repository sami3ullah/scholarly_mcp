/** Turns text into vectors in-process (key design decision 5). */
export interface Embedder {
  /** Identifies the model; stored per chunk so versions are never mixed in one index. */
  readonly modelVersion: string;
  readonly dimensions: number;
  /** Embeds indexable passages, one vector per text, in order. */
  embedPassages(texts: readonly string[], signal: AbortSignal): Promise<Float32Array[]>;
  /** Embeds a search query. */
  embedQuery(text: string, signal: AbortSignal): Promise<Float32Array>;
}

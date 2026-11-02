/**
 * The normalised mean of an article's chunk vectors: one vector that stands for the whole
 * article, for "find related" (PLAN.md tool contracts). Undefined for no vectors, or when
 * they cancel out, since a zero vector has no direction to search in.
 */
export function meanVector(vectors: readonly Float32Array[]): Float32Array | undefined {
  const first = vectors[0];
  if (first === undefined) return undefined;
  const mean = new Float32Array(first.length);
  for (const vector of vectors) {
    for (let i = 0; i < mean.length; i += 1) mean[i] = (mean[i] ?? 0) + (vector[i] ?? 0);
  }
  const norm = Math.hypot(...mean);
  if (norm === 0) return undefined;
  for (let i = 0; i < mean.length; i += 1) mean[i] = (mean[i] ?? 0) / norm;
  return mean;
}

/** The ONNX export of multilingual-e5-small on the Hugging Face Hub (ADR 0002). */
export const MODEL_ID = 'Xenova/multilingual-e5-small';
/**
 * Pinned Hub commit, so every build loads the same weights. Changing it, or the dtype,
 * changes `MODEL_VERSION` and therefore needs a full new index (ADR 0010).
 */
export const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
/** 8-bit quantised weights: the variant the Phase 0 spike measured. */
export const MODEL_DTYPE = 'q8';
/** Stored on every chunk; an index never mixes versions. */
export const MODEL_VERSION = `${MODEL_ID}@${MODEL_REVISION.slice(0, 12)}+${MODEL_DTYPE}`;
/** e5 models read at most this many tokens, special tokens included. */
export const MODEL_MAX_TOKENS = 512;

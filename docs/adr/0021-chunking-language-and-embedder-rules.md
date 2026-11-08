# 0021 Chunking, per-chunk language and embedder rules

- Status: accepted, amended by [ADR 0028](0028-selectable-embedding-model.md) (the model and vector size became settings)
- Date: 2026-11-02
- Fills gaps in: ARCHITECTURE.md "Chunking" and key design decision 5

## Context

The plan sets chunk sizes (200-400 tokens, sentence fallback, 1-2 sentence overlap, title prepended) but not how to count tokens, what counts as structure, or how language is decided. Facts found while building it (spike sample of 500 Thieme records, 236 with abstracts):

- 22 of 236 abstracts (9%) are English although Crossref declares the article `de`. A stopword detector got all 22 right and misclassified no paragraph in the sample; every paragraph it could not decide was a short fragment such as a heading.
- German medical words split into many subword tokens, so word counts underestimate what the model reads (512 tokens, truncating the rest).
- With the q8 weights, a text's vector changes slightly with the texts it is batched with (cosine 0.99956 to the unbatched vector; fp32 is identical). On CPU, batching 16 texts of mixed length was also slower than one at a time (242 ms vs 192 ms for 32 texts), because of padding.
- The JATS cleaner writes abstracts as paragraphs led by `Label: `; a sentence such as "Two groups were compared: A and B" looks the same.

## Decision

1. **Tokens are counted with the model's own tokenizer.** `Embedder.countTokens` is passed to the pure `chunkDocument`, so core stays free of the model while chunks are sized to what the model reads. In the sample no chunk exceeds 400 tokens, and title plus chunk stays at or below 431 tokens.
2. **Structure first.** Sections are hard boundaries; short sections stay short, since the title in front of the embedding text keeps their context. Inside a section, paragraphs and then sentences are packed into balanced chunks of at most 400 tokens (a run of 450 becomes about 225 + 225); a chunk past its share still finishes a paragraph that fits. A sentence over the limit is split between words. Up to two trailing sentences (at most 100 tokens) repeat in the next chunk of the same section.
3. **Sentences** come from `Intl.Segmenter`, with breaks after common EN/DE abbreviations and single letters ("et al.", "z. B.", initials) rejoined.
4. **Language per paragraph, stored per chunk.** `detectLanguage` scores German and English function words (plus umlauts and ß) and returns `undefined` when evidence is thin or mixed. An unclear paragraph takes its nearest clear neighbour's language before the declared article language. A change of language starts a new chunk, so bilingual abstracts give single-language chunks. Only `de` and `en` are detected; other languages fall back the same way.
5. **Abstract labels** are parsed from `Label: ` prefixes only when the abstract has at least two distinct labels; otherwise the colon phrase stays text. Articles without an abstract get one `metadata` chunk of title and subtitle, embedded without the title repeated.
6. **Embedder.** `packages/embedder-onnx` loads `Xenova/multilingual-e5-small` at a pinned Hub revision with q8 weights; `MODEL_VERSION` (`Xenova/multilingual-e5-small@761b726dd34f+q8`) changes whenever either does. It adds the `passage: ` and `query: ` prefixes, runs one warm-up embedding before it resolves (readiness), and shares a semaphore between queries and index batches, one slot per batch, so queries are not stuck behind a long indexing call. Waiting callers abort through their signal; there is no separate queue timeout.
7. **Batch size defaults to 1**, so re-embedding an unchanged text gives the same vector. The embedder contract checks this with a tolerance of 1e-5. `EMBEDDER_ALLOW_REMOTE=false` makes the image use only its baked-in model.

## Consequences

- Chunking needs a loaded tokenizer; tests use a word counter or the fake embedder's.
- A bad declared language costs nothing at chunk level, but search filters on article language still see Crossref's value; the index and search rules should decide whether the article language is corrected from its chunks.
- Raising the batch size trades determinism for nothing on CPU; revisit only on GPU or with fp32 weights.
- CI downloads the q8 model once per revision (about 135 MB) and caches `.cache/models`.

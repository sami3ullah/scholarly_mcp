// Build step: downloads the embedding model into EMBEDDER_CACHE_DIR, so the image starts
// without network access (EMBEDDER_ALLOW_REMOTE=false).
import { embedderConfigSchema, loadOnnxEmbedder } from '@scholarly-mcp/embedder-onnx';

const config = embedderConfigSchema.parse({ ...process.env, EMBEDDER_ALLOW_REMOTE: 'true' });
const embedder = await loadOnnxEmbedder(config);
const [vector] = await embedder.embedPassages(['Vorhofflimmern'], AbortSignal.timeout(60_000));
process.stdout.write(
  `Model ${embedder.modelVersion} cached, ${String(vector?.length)} dimensions\n`,
);

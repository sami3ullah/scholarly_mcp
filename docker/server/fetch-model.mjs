// Build step: downloads the embedding model into EMBEDDER_CACHE_DIR, so the image starts
// without network access (EMBEDDER_ALLOW_REMOTE=false). Hugging Face often throttles the
// shared addresses of CI runners, so a failed download is retried with growing waits.
import { setTimeout as delay } from 'node:timers/promises';
import { embedderConfigSchema, loadOnnxEmbedder } from '@scholarly-mcp/embedder-onnx';

const ATTEMPTS = 6;
const config = embedderConfigSchema.parse({ ...process.env, EMBEDDER_ALLOW_REMOTE: 'true' });

for (let attempt = 1; ; attempt++) {
  try {
    const embedder = await loadOnnxEmbedder(config);
    const [vector] = await embedder.embedPassages(['Vorhofflimmern'], AbortSignal.timeout(60_000));
    process.stdout.write(
      `Model ${embedder.modelVersion} cached, ${String(vector?.length)} dimensions\n`,
    );
    break;
  } catch (error) {
    if (attempt >= ATTEMPTS) throw error;
    const waitMs = 10_000 * attempt;
    process.stderr.write(
      `Model download failed (attempt ${String(attempt)} of ${String(ATTEMPTS)}): ${String(error)}; retrying in ${String(waitMs / 1000)} s\n`,
    );
    await delay(waitMs);
  }
}

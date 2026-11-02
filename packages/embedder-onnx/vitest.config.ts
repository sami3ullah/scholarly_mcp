import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'embedder-onnx' } });
export { config as default };

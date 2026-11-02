import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'ingest' } });
export { config as default };

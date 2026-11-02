import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'store-sqlite' } });
export { config as default };

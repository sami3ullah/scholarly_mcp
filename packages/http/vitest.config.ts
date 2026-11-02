import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'http' } });
export { config as default };

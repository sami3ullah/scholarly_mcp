import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'server' } });
export { config as default };

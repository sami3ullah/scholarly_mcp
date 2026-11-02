import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'logger' } });
export { config as default };

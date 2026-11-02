import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'core' } });
export { config as default };

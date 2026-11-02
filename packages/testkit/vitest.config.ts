import { defineProject } from 'vitest/config';

export const config = defineProject({ test: { name: 'testkit' } });
export { config as default };

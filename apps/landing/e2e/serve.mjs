// Serves the built app against the stub landing API for Lighthouse CI: one command that
// starts both and stops both.
import { spawn } from 'node:child_process';

const STUB_PORT = '8299';
const APP_PORT = '3200';
const children = [
  spawn('node', ['e2e/stub-api.mjs'], { stdio: 'inherit', env: { ...process.env, STUB_PORT } }),
  spawn('npx', ['next', 'start', '--port', APP_PORT, '--hostname', '127.0.0.1'], {
    stdio: 'inherit',
    env: { ...process.env, LANDING_API_URL: `http://127.0.0.1:${STUB_PORT}`, LOG_LEVEL: 'warn' },
  }),
];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
for (const child of children) child.on('exit', (code) => code !== null && code !== 0 && stop());

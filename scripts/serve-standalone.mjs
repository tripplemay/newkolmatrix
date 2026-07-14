// CICD-VPS F004 — 起 standalone 产物（与 Docker runner 一致：static+public copy 进 standalone 再 node server.js）。
// 用于视觉回归 webServer：测的就是实际部署的 artifact，避免 `next start` + output:standalone 的不支持组合。
import { cpSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (existsSync('public')) {
  cpSync('public', '.next/standalone/public', { recursive: true });
}

const res = spawnSync('node', ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '3000', HOSTNAME: '127.0.0.1' },
});
process.exit(res.status ?? 0);

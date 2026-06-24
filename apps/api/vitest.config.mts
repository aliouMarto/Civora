import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Charge manuellement le .env racine du monorepo
function loadRootEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(resolve(__dirname, '../../.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      env[key] = value;
    }
  } catch {
    // pas de .env — on utilisera les défauts ci-dessous
  }
  return env;
}

const rootEnv = loadRootEnv();

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({ module: { type: 'es6' } }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts'],
    env: {
      DATABASE_URL: rootEnv['DATABASE_URL'] ?? 'postgresql://civora:civora_secret@localhost:5432/civora',
      REDIS_URL: rootEnv['REDIS_URL'] ?? 'redis://localhost:6379',
      GOTENBERG_URL: rootEnv['GOTENBERG_URL'] ?? 'http://localhost:3002',
      NODE_ENV: 'test',
    },
  },
});

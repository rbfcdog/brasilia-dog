import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORKSPACE_ROOT = resolve(API_ROOT, '..');

function environmentPaths(explicitPath?: string): string[] {
  if (explicitPath) {
    return [resolve(explicitPath)];
  }

  return [resolve(process.cwd(), '.env'), resolve(API_ROOT, '.env'), resolve(WORKSPACE_ROOT, '.env')];
}

export function loadEnvironment({
  environment = process.env,
  path,
}: {
  environment?: NodeJS.ProcessEnv;
  path?: string;
} = {}): NodeJS.ProcessEnv {
  for (const candidate of [...new Set(environmentPaths(path))]) {
    if (!existsSync(candidate)) continue;
    const parsed = dotenv.parse(readFileSync(candidate));
    for (const [name, value] of Object.entries(parsed)) {
      if (!environment[name]?.trim()) {
        environment[name] = value;
      }
    }
  }

  return environment;
}

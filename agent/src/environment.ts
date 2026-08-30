import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = resolve(AGENT_ROOT, '..');

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  for (const path of [...new Set([
    resolve(process.cwd(), '.env'),
    resolve(AGENT_ROOT, '.env'),
    resolve(WORKSPACE_ROOT, '.env'),
  ])]) {
    if (!existsSync(path)) continue;
    for (const [name, value] of Object.entries(dotenv.parse(readFileSync(path)))) {
      if (!environment[name]?.trim()) environment[name] = value;
    }
  }
  return environment;
}

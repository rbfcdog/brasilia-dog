import { createServer } from 'node:http';
import { Request } from 'mppx/server';

import type { AppHandler } from './types.js';

export function createNodeServer(app: AppHandler) {
  return createServer(Request.toNodeListener(app));
}

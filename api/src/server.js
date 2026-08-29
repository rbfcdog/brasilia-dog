import { createServer } from 'node:http';
import { Request } from 'mppx/server';

export function createNodeServer(app) {
  return createServer(Request.toNodeListener(app));
}

import cors from 'cors';
import express, { type Express } from 'express';
import { Request } from 'mppx/server';

import type { AppHandler } from '../domain/types.js';

export function createExpressApp(appHandler: AppHandler): Express {
  const app = express();
  const listener = Request.toNodeListener(appHandler);

  app.use(cors());
  app.use((request, response) => {
    void listener(request, response);
  });

  return app;
}

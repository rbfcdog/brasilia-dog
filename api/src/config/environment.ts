import dotenv from 'dotenv';

export function loadEnvironment({
  environment = process.env,
  path = '.env',
}: {
  environment?: NodeJS.ProcessEnv;
  path?: string;
} = {}): NodeJS.ProcessEnv {
  const result = dotenv.config({
    path,
    processEnv: environment,
    quiet: true,
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw result.error;
  }

  return environment;
}

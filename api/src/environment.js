import dotenv from 'dotenv';

export function loadEnvironment({ environment = process.env, path = '.env' } = {}) {
  const result = dotenv.config({
    path,
    processEnv: environment,
    quiet: true,
  });

  if (result.error && result.error.code !== 'ENOENT') {
    throw result.error;
  }

  return environment;
}

import { z } from 'zod';
import { AgentError } from './errors.js';

const baseSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535),
  AGENT_SERVICE_TOKEN: z.string().min(16),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  ADAPTER_MODE: z.enum(['demo', 'http']),
  BACKEND_BASE_URL: z.url().optional(),
  AGENT_BACKEND_TOKEN: z.string().min(16).optional(),
});

export interface AgentConfig {
  port: number;
  serviceToken: string;
  openAIApiKey: string;
  openAIModel: string;
  adapterMode: 'demo' | 'http';
  backendBaseUrl?: string;
  backendToken?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AgentConfig {
  const result = baseSchema.safeParse(environment);
  if (!result.success) {
    throw new AgentError('CONFIG_INVALID', `Invalid agent configuration: ${z.prettifyError(result.error)}`);
  }

  const value = result.data;
  if (value.ADAPTER_MODE === 'http' && (!value.BACKEND_BASE_URL || !value.AGENT_BACKEND_TOKEN)) {
    throw new AgentError(
      'CONFIG_INVALID',
      'BACKEND_BASE_URL and AGENT_BACKEND_TOKEN are required when ADAPTER_MODE=http.',
    );
  }

  return {
    port: value.PORT,
    serviceToken: value.AGENT_SERVICE_TOKEN,
    openAIApiKey: value.OPENAI_API_KEY,
    openAIModel: value.OPENAI_MODEL,
    adapterMode: value.ADAPTER_MODE,
    ...(value.BACKEND_BASE_URL ? { backendBaseUrl: value.BACKEND_BASE_URL } : {}),
    ...(value.AGENT_BACKEND_TOKEN ? { backendToken: value.AGENT_BACKEND_TOKEN } : {}),
  };
}

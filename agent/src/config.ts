import { z } from 'zod';
import { AgentError } from './errors.js';

const baseSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  AGENT_SERVICE_TOKEN: z.string().min(16),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  ADAPTER_MODE: z.enum(['demo', 'http']),
  BACKEND_BASE_URL: z.url().optional(),
  AGENT_BACKEND_TOKEN: z.string().min(16).optional(),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_test_').optional(),
  AGENT_SIGNING_PRIVATE_JWK: z.string().optional(),
  AGENT_SIGNING_KEY_PATH: z.string().optional(),
});

export interface AgentConfig {
  port: number;
  serviceToken: string;
  openAIApiKey: string;
  openAIModel: string;
  adapterMode: 'demo' | 'http';
  backendBaseUrl?: string;
  backendToken?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  stripeSecretKey?: string;
  signingPrivateJwk?: string;
  signingKeyPath: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AgentConfig {
  const result = baseSchema.safeParse(environment);
  if (!result.success) {
    throw new AgentError('CONFIG_INVALID', `Invalid agent configuration: ${z.prettifyError(result.error)}`);
  }

  const value = result.data;
  const backendToken = value.AGENT_BACKEND_TOKEN ?? value.AGENT_SERVICE_TOKEN;
  if (value.ADAPTER_MODE === 'http' && (!value.BACKEND_BASE_URL || !backendToken)) {
    throw new AgentError(
      'CONFIG_INVALID',
      'BACKEND_BASE_URL and AGENT_BACKEND_TOKEN are required when ADAPTER_MODE=http.',
    );
  }
  const supabaseKey = value.SUPABASE_SECRET_KEY ?? value.SUPABASE_SERVICE_ROLE_KEY;

  return {
    port: value.PORT,
    serviceToken: value.AGENT_SERVICE_TOKEN,
    openAIApiKey: value.OPENAI_API_KEY,
    openAIModel: value.OPENAI_MODEL,
    adapterMode: value.ADAPTER_MODE,
    ...(value.BACKEND_BASE_URL ? { backendBaseUrl: value.BACKEND_BASE_URL } : {}),
    ...(backendToken ? { backendToken } : {}),
    ...(value.SUPABASE_URL ? { supabaseUrl: value.SUPABASE_URL } : {}),
    ...(supabaseKey ? { supabaseKey } : {}),
    ...(value.STRIPE_SECRET_KEY ? { stripeSecretKey: value.STRIPE_SECRET_KEY } : {}),
    ...(value.AGENT_SIGNING_PRIVATE_JWK ? { signingPrivateJwk: value.AGENT_SIGNING_PRIVATE_JWK } : {}),
    signingKeyPath: value.AGENT_SIGNING_KEY_PATH ?? '.agent-signing-private.jwk',
  };
}

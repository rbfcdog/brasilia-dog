import type { AppConfig, StripeMode, SupabaseConfig } from '../domain/types.js';

const MODE_BY_NAME: Record<StripeMode, true> = { sandbox: true, live: true };

function requireValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535.');
  }

  return port;
}

function optionalValue(environment: NodeJS.ProcessEnv, name: string): string | null {
  return environment[name]?.trim() || null;
}

function isStripeMode(value: string): value is StripeMode {
  return value === 'sandbox' || value === 'live';
}

function loadPasskeyConfig(environment: NodeJS.ProcessEnv): AppConfig['passkey'] {
  const rpName = environment.PASSKEY_RP_NAME ?? 'Vero Marketplace';
  const rpId = environment.PASSKEY_RP_ID ?? 'localhost';
  const origin = environment.PASSKEY_ORIGIN ?? 'http://localhost:3000';

  if (environment.NODE_ENV !== 'production') {
    return { rpName, rpId, origin };
  }

  if (!environment.PASSKEY_RP_ID?.trim() || !environment.PASSKEY_ORIGIN?.trim()) {
    throw new Error('PASSKEY_RP_ID and PASSKEY_ORIGIN must be explicitly configured in production.');
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error('PASSKEY_ORIGIN must be a valid HTTPS origin in production.');
  }

  if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin) {
    throw new Error('PASSKEY_ORIGIN must be a valid HTTPS origin in production.');
  }

  if (parsedOrigin.hostname !== rpId && !parsedOrigin.hostname.endsWith(`.${rpId}`)) {
    throw new Error('PASSKEY_RP_ID must match PASSKEY_ORIGIN or be its registrable parent domain.');
  }

  return { rpName, rpId, origin };
}

export function loadSupabaseConfig(environment: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = optionalValue(environment, 'SUPABASE_URL');
  const serviceRoleKey = optionalValue(environment, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!url && !serviceRoleKey) {
    return null;
  }

  if (!url) {
    throw new Error('SUPABASE_URL is required when SUPABASE_SERVICE_ROLE_KEY is configured.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when SUPABASE_URL is configured.');
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error('SUPABASE_URL must be an HTTP or HTTPS URL.');
  }

  const key = serviceRoleKey;

  return {
    url,
    key,
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const modeValue = environment.STRIPE_MODE ?? 'sandbox';
  if (!isStripeMode(modeValue) || !MODE_BY_NAME[modeValue]) {
    throw new Error('STRIPE_MODE must be sandbox or live.');
  }
  const mode = modeValue;

  const mppSecretKey = requireValue(environment, 'MPP_SECRET_KEY');
  const stripeSecretKey = requireValue(environment, 'STRIPE_SECRET_KEY');
  const stripeProfileId = requireValue(environment, 'STRIPE_PROFILE_ID');
  const sessionSecret = requireValue(environment, 'SESSION_SECRET');

  if (Buffer.byteLength(mppSecretKey, 'utf8') < 32) {
    throw new Error('MPP_SECRET_KEY must contain at least 32 bytes.');
  }
  const expectedKeyPrefix = mode === 'sandbox' ? 'sk_test_' : 'sk_live_';
  const expectedProfilePrefix = mode === 'sandbox' ? 'profile_test_' : 'profile_';

  if (!stripeSecretKey.startsWith(expectedKeyPrefix)) {
    throw new Error(`${mode} mode requires a ${expectedKeyPrefix} Stripe secret key.`);
  }

  if (!stripeProfileId.startsWith(expectedProfilePrefix)) {
    throw new Error(`${mode} mode requires a ${expectedProfilePrefix} Stripe profile ID.`);
  }

  if (mode === 'live' && environment.ALLOW_LIVE_MPP_TEST !== 'true') {
    throw new Error('Live mode requires ALLOW_LIVE_MPP_TEST=true.');
  }

  return {
    port: parsePort(environment.PORT),
    mode,
    mppSecretKey,
    stripeSecretKey,
    stripeProfileId,
    supabase: loadSupabaseConfig(environment),
    passkey: loadPasskeyConfig(environment),
    sessionSecret,
    agentServiceToken: optionalValue(environment, 'AGENT_SERVICE_TOKEN'),
    agentServiceOutboundToken: optionalValue(environment, 'AGENT_SERVICE_OUTBOUND_TOKEN'),
    agentServiceUrl: optionalValue(environment, 'AGENT_SERVICE_URL'),
  };
}

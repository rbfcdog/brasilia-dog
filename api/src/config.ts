import type { AppConfig, StripeMode, SupabaseConfig } from './types.js';

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

export function loadSupabaseConfig(environment: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = optionalValue(environment, 'SUPABASE_URL');
  const secretKey = optionalValue(environment, 'SUPABASE_SECRET_KEY');
  const legacyServiceRoleKey = optionalValue(environment, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!url && !secretKey && !legacyServiceRoleKey) {
    return null;
  }

  if (!url) {
    throw new Error('SUPABASE_URL is required when Supabase credentials are configured.');
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error('SUPABASE_URL must be an HTTP or HTTPS URL.');
  }

  if (secretKey && legacyServiceRoleKey) {
    throw new Error('Configure only one of SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const key = secretKey ?? legacyServiceRoleKey;
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required when SUPABASE_URL is configured.');
  }

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
  };
}

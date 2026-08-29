const MODES = new Set(['sandbox', 'live']);

function summarizeEnvironment(environment) {
  const names = ['STRIPE_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_PROFILE_ID', 'MPP_SECRET_KEY', 'PORT', 'ALLOW_LIVE_MPP_TEST'];
  const summary = {};
  for (const name of names) {
    const value = environment[name];
    if (value === undefined) {
      summary[name] = 'UNSET';
    } else if (value.trim() === '') {
      summary[name] = 'EMPTY';
    } else {
      summary[name] = `SET (length=${value.length}, prefix=${JSON.stringify(value.slice(0, 8))})`;
    }
  }
  return summary;
}

function requireValue(environment, name) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parsePort(value) {
  const port = Number(value ?? '3000');

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535.');
  }

  return port;
}

export function loadConfig(environment = process.env) {
  const mode = environment.STRIPE_MODE ?? 'sandbox';

  if (!MODES.has(mode)) {
    throw new Error('STRIPE_MODE must be sandbox or live.');
  }

  const mppSecretKey = requireValue(environment, 'MPP_SECRET_KEY');
  const stripeSecretKey = requireValue(environment, 'STRIPE_SECRET_KEY');
  const stripeProfileId = requireValue(environment, 'STRIPE_PROFILE_ID');

  if (Buffer.byteLength(mppSecretKey, 'utf8') < 32) {
    throw new Error('MPP_SECRET_KEY must contain at least 32 bytes.');
  }
  const expectedKeyPrefix = mode === 'sandbox' ? 'sk_test_' : 'sk_live_';
  const expectedProfilePrefix = mode === 'sandbox' ? 'profile_test_' : 'profile_';

  if (!stripeSecretKey.startsWith(expectedKeyPrefix)) {
    console.error(`Configuration diagnostic: ${JSON.stringify(summarizeEnvironment(environment), null, 2)}`);
    throw new Error(`${mode} mode requires a ${expectedKeyPrefix} Stripe secret key.`);
  }

  if (!stripeProfileId.startsWith(expectedProfilePrefix)) {
    console.error(`Configuration diagnostic: ${JSON.stringify(summarizeEnvironment(environment), null, 2)}`);
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
  };
}

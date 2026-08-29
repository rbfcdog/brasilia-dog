import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig, loadSupabaseConfig } from '../src/config/config.js';
import { loadEnvironment } from '../src/config/environment.js';


const sandboxEnvironment = {
  MPP_SECRET_KEY: '12345678901234567890123456789012',
  PORT: '3000',
  STRIPE_MODE: 'sandbox',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_PROFILE_ID: 'profile_test_example',
};

test('loads a sandbox Stripe MPP configuration with test credentials', () => {
  assert.deepEqual(loadConfig(sandboxEnvironment), {
    port: 3000,
    mode: 'sandbox',
    mppSecretKey: '12345678901234567890123456789012',
    stripeSecretKey: 'sk_test_example',
    stripeProfileId: 'profile_test_example',
    supabase: null,
  });
});

test('requires a dedicated MPP challenge secret', () => {
  const { MPP_SECRET_KEY, ...missingSecret } = sandboxEnvironment;

  assert.throws(() => loadConfig(missingSecret), /MPP_SECRET_KEY is required/);
});

test('rejects an MPP challenge secret shorter than 32 bytes', () => {
  assert.throws(
    () => loadConfig({ ...sandboxEnvironment, MPP_SECRET_KEY: 'too-short' }),
    /at least 32 bytes/,
  );
});

test('rejects a live Stripe key in sandbox mode', () => {
  assert.throws(
    () => loadConfig({ ...sandboxEnvironment, STRIPE_SECRET_KEY: 'sk_live_example' }),
    /sk_test_/,
  );
});

test('does not configure Supabase when no Supabase variables are supplied', () => {
  assert.equal(loadSupabaseConfig({}), null);
});

test('rejects partial Supabase configuration', () => {
  assert.throws(
    () => loadSupabaseConfig({ SUPABASE_URL: 'https://example.supabase.co' }),
    /SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required/,
  );
});

test('rejects conflicting Supabase server credentials', () => {
  assert.throws(
    () => loadSupabaseConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_example',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role-example',
    }),
    /Configure only one/,
  );
});

test('loads a server-only Supabase secret key', () => {
  assert.deepEqual(loadSupabaseConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_example',
  }), {
    url: 'https://example.supabase.co',
    key: 'sb_secret_example',
  });
});

test('requires explicit acknowledgement before enabling live mode', () => {
  assert.throws(
    () => loadConfig({
      ...sandboxEnvironment,
      STRIPE_MODE: 'live',
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_PROFILE_ID: 'profile_example',
    }),
    /ALLOW_LIVE_MPP_TEST=true/,
  );
});

test('permits live mode only with explicit acknowledgement and live credentials', () => {
  assert.deepEqual(loadConfig({
    ...sandboxEnvironment,
    STRIPE_MODE: 'live',
    ALLOW_LIVE_MPP_TEST: 'true',
    STRIPE_SECRET_KEY: 'sk_live_example',
    STRIPE_PROFILE_ID: 'profile_example',
  }), {
    port: 3000,
    mode: 'live',
    mppSecretKey: '12345678901234567890123456789012',
    stripeSecretKey: 'sk_live_example',
    stripeProfileId: 'profile_example',
    supabase: null,
  });
});

test('loads local values without overwriting Railway runtime variables', async () => {
  assert.equal(typeof loadEnvironment, 'function');

  const directory = await mkdtemp(join(tmpdir(), 'nextwave-mpp-'));
  const environmentPath = join(directory, '.env');
  const environment = {
    STRIPE_SECRET_KEY: 'sk_test_injected_by_railway',
  };

  try {
    await writeFile(
      environmentPath,
      'MPP_SECRET_KEY=local-mpp-secret\nSTRIPE_SECRET_KEY=sk_test_from_file\n',
    );

    loadEnvironment({ environment, path: environmentPath });

    assert.deepEqual(environment, {
      MPP_SECRET_KEY: 'local-mpp-secret',
      STRIPE_SECRET_KEY: 'sk_test_injected_by_railway',
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

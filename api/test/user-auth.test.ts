import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createApp } from '../src/http/app.js';
import { UserAuthService } from '../src/services/user-auth-service.js';

function authClient(): SupabaseClient {
  return {
    auth: {
      signInWithPassword: async ({ email }: { email: string }) => ({
        data: {
          user: { id: 'user-1', email },
          session: { access_token: 'access-token', refresh_token: 'refresh-token', expires_at: 2_000_000_000 },
        },
        error: null,
      }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error('unused') }),
      refreshSession: async () => ({ data: { user: null, session: null }, error: new Error('unused') }),
      getUser: async (token: string) => ({
        data: { user: token === 'access-token' ? { id: 'user-1', email: 'buyer@example.com' } : null },
        error: token === 'access-token' ? null : new Error('invalid'),
      }),
    },
  } as unknown as SupabaseClient;
}

test('API signs users in without exposing storage credentials to the frontend', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unused'),
    userAuthService: new UserAuthService(authClient()),
  });
  const response = await app(new Request('http://localhost/v1/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'buyer@example.com', password: 'password123' }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    session: {
      user: { id: 'user-1', email: 'buyer@example.com' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 2_000_000_000,
    },
  });
});

test('API validates the opaque BFF session access token', async () => {
  const app = createApp({
    paidHandler: async () => new Response('unused'),
    userAuthService: new UserAuthService(authClient()),
  });
  const response = await app(new Request('http://localhost/v1/auth/session', {
    headers: { Authorization: 'Bearer access-token' },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: { id: 'user-1', email: 'buyer@example.com' } });
});

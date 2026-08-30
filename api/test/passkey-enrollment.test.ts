import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PasskeyEnrollmentService } from '../src/services/passkey-enrollment-service.js';

function fakeClient() {
  const rows = new Map<string, Record<string, unknown>>();
  let operation: 'select' | 'update' = 'select';
  let update: Record<string, unknown> = {};
  let filters: Array<[string, unknown]> = [];
  const chain = {
    select() { return chain; },
    update(value: Record<string, unknown>) { operation = 'update'; update = value; filters = []; return chain; },
    eq(column: string, value: unknown) { filters.push([column, value]); return chain; },
    is(column: string, value: unknown) { filters.push([column, value]); return chain; },
    gt() { return chain; },
    async maybeSingle() {
      const tokenHash = String(filters.find(([column]) => column === 'token_hash')?.[1] ?? '');
      const row = rows.get(tokenHash);
      if (!row) return { data: null, error: null };
      if (operation === 'update') {
        const userId = filters.find(([column]) => column === 'user_id')?.[1];
        if (row.user_id !== userId || row.consumed_at !== null) return { data: null, error: null };
        Object.assign(row, update);
        return { data: { token_hash: tokenHash }, error: null };
      }
      return { data: row, error: null };
    },
  };
  const client = {
    from() {
      return {
        insert: async (row: Record<string, unknown>) => {
          rows.set(String(row.token_hash), { ...row, consumed_at: null });
          return { error: null };
        },
        select() { operation = 'select'; filters = []; return chain; },
        update: chain.update,
      };
    },
  } as unknown as SupabaseClient;
  return { client, rows };
}

test('enrollment grant is bound to one user and consumed once', async () => {
  const { client } = fakeClient();
  const service = new PasskeyEnrollmentService(client);
  const grant = await service.create('user-1');

  assert.equal((await service.resolve(grant.token))?.userId, 'user-1');
  assert.equal(await service.consume(grant.token, 'user-2'), false);
  assert.equal(await service.consume(grant.token, 'user-1'), true);
  assert.equal(await service.resolve(grant.token), null);
  assert.equal(await service.consume(grant.token, 'user-1'), false);
});

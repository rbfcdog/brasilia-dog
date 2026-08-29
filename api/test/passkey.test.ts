import assert from 'node:assert/strict';
import test from 'node:test';

import { PasskeyService } from '../src/services/passkey-service.js';
import { InMemoryPasskeyStore } from '../src/services/passkey-store.js';

const rpName = 'Test RP';
const rpId = 'localhost';
const origin = 'http://localhost:3000';

function createService() {
  const store = new InMemoryPasskeyStore();
  const service = new PasskeyService({ rpName, rpId, origin, store });
  return { service, store };
}

test('generates WebAuthn registration options with a challenge', async () => {
  const { service } = createService();

  const options = await service.generateRegistration('user-1', 'alice');

  assert.equal(options.rp.name, rpName);
  assert.equal(options.rp.id, rpId);
  assert.equal(options.user.name, 'alice');
  assert.ok(options.challenge.length > 0);
  assert.equal(options.attestation, 'none');
});

test('rejects registration verification without a pending challenge', async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.verifyRegistration('user-1', {}),
    /No pending registration challenge/,
  );
});

test('generates WebAuthn authentication options with a challenge', async () => {
  const { service } = createService();

  const options = await service.generateAuthentication('user-1');

  assert.equal(options.rpId, rpId);
  assert.ok(options.challenge.length > 0);
});

test('rejects authentication verification without a pending challenge', async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.verifyAuthentication('user-1', { id: 'nonexistent' }),
    /No pending authentication challenge/,
  );
});

test('rejects authentication for an unknown credential', async () => {
  const { service } = createService();

  // Set a challenge first
  await service.generateAuthentication('user-1');

  await assert.rejects(
    () => service.verifyAuthentication('user-1', { id: 'nonexistent' }),
    /Credential not found/,
  );
});

test('in-memory store round-trips a credential', async () => {
  const store = new InMemoryPasskeyStore();
  const credential = {
    id: 'cred-1',
    credentialId: 'cred-1',
    publicKey: Buffer.from([0x04, 0x01, 0x02]),
    counter: 0,
    transports: ['internal'],
    backedUp: false,
  };

  await store.saveCredential('user-1', credential);
  const retrieved = await store.getCredential('user-1', 'cred-1');
  assert.equal(retrieved?.credentialId, 'cred-1');
  assert.deepEqual(retrieved?.transports, ['internal']);

  const listed = await store.listCredentials('user-1');
  assert.equal(listed.length, 1);

  await store.updateCounter('user-1', 'cred-1', 5);
  const updated = await store.getCredential('user-1', 'cred-1');
  assert.equal(updated?.counter, 5);
});

test('in-memory store challenges are isolated per user', async () => {
  const store = new InMemoryPasskeyStore();

  await store.setCurrentChallenge('user-1', 'challenge-1');
  await store.setCurrentChallenge('user-2', 'challenge-2');

  assert.equal(await store.getCurrentChallenge('user-1'), 'challenge-1');
  assert.equal(await store.getCurrentChallenge('user-2'), 'challenge-2');

  await store.setCurrentChallenge('user-1', '');
  assert.equal(await store.getCurrentChallenge('user-1'), null);
  assert.equal(await store.getCurrentChallenge('user-2'), 'challenge-2');
});

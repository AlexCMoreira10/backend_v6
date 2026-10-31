import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.SUBACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString('base64');

const {
  criptografarCpf,
  descriptografarCpf,
  gerarIndiceCpf,
  hashearSenha,
  verificarSenha
} = await import('../src/utils/subcontaSecurity.js');

test('encrypts CPF at rest and produces a deterministic protected lookup index', () => {
  const encrypted = criptografarCpf('52998224725');
  assert.notEqual(encrypted.ciphertext, '52998224725');
  assert.equal(descriptografarCpf(encrypted), '52998224725');
  assert.equal(gerarIndiceCpf('52998224725'), gerarIndiceCpf('52998224725'));
});

test('hashes temporary passwords and verifies them without storing plaintext', async () => {
  const credential = await hashearSenha('SenhaTemporaria123');
  assert.equal(credential.hash.includes('SenhaTemporaria123'), false);
  assert.equal(await verificarSenha('SenhaTemporaria123', credential), true);
  assert.equal(await verificarSenha('SenhaErrada123', credential), false);
});

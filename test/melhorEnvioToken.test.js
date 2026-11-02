import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criptografarTokensMelhorEnvio,
  descriptografarTokensMelhorEnvio
} from '../src/utils/melhorEnvioToken.js';

test('encrypts tokens and only decrypts them with the configured key', () => {
  const chaveAnterior = process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY;
  process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const tokens = { accessToken: 'access-secret', refreshToken: 'refresh-secret' };
    const cifrado = criptografarTokensMelhorEnvio(tokens);
    assert.equal(JSON.stringify(cifrado).includes('access-secret'), false);
    assert.deepEqual(descriptografarTokensMelhorEnvio(cifrado), tokens);

    process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString('base64');
    assert.throws(() => descriptografarTokensMelhorEnvio(cifrado));
  } finally {
    if (chaveAnterior === undefined) delete process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY;
    else process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY = chaveAnterior;
  }
});

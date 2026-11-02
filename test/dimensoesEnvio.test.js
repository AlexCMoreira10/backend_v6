import test from 'node:test';
import assert from 'node:assert/strict';
import { validarDimensoesEnvio } from '../src/utils/dimensoesEnvio.js';

test('allows omitted dimensions and validates positive numeric package measurements', () => {
  assert.equal(validarDimensoesEnvio(undefined), null);
  assert.equal(validarDimensoesEnvio(null), null);
  assert.equal(validarDimensoesEnvio({
    altura: 4,
    largura: 14,
    comprimento: 21,
    peso: 450
  }), null);
});

test('rejects malformed or incomplete package dimensions', () => {
  assert.match(validarDimensoesEnvio([]), /objeto/);
  assert.match(validarDimensoesEnvio('14x21'), /objeto/);
  assert.match(validarDimensoesEnvio({ altura: 4, largura: 14, comprimento: 21 }), /peso/);
});

test('rejects non-numeric, non-finite, zero, and negative dimensions', () => {
  for (const valor of ['4', Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    assert.match(validarDimensoesEnvio({
      altura: valor,
      largura: 14,
      comprimento: 21,
      peso: 450
    }), /altura/);
  }
});

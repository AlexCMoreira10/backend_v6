import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarPayloadCotacaoMelhorEnvio,
  normalizarCotacoesMelhorEnvio
} from '../src/utils/melhorEnvioFrete.js';

const livroValido = {
  id: 'livro-1',
  localizacao: '01001-000',
  preco: 39.9,
  dimensoes: {
    altura: 4,
    largura: 14,
    comprimento: 21,
    peso: 450
  }
};

test('builds Melhor Envio products payload with CEPs and converts package weight to kilograms', () => {
  assert.deepEqual(criarPayloadCotacaoMelhorEnvio({
    livro: livroValido,
    cepDestino: '20040-020'
  }), {
    from: { postal_code: '01001000' },
    to: { postal_code: '20040020' },
    products: [{
      id: 'livro-1',
      width: 14,
      height: 4,
      length: 21,
      weight: 0.45,
      insurance_value: 39.9,
      quantity: 1
    }]
  });
});

test('uses the seller profile CEP when the book location is not a CEP', () => {
  const payload = criarPayloadCotacaoMelhorEnvio({
    livro: { ...livroValido, localizacao: 'São Paulo - SP' },
    vendedor: { endereco: { cep: '01310-100' } },
    cepDestino: '20040020'
  });
  assert.equal(payload.from.postal_code, '01310100');
});

test('rejects invalid CEPs, missing package dimensions, and invalid insurance values', () => {
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: { ...livroValido, localizacao: 'São Paulo - SP' },
      cepDestino: '20040020'
    }),
    { status: 422 }
  );
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: { ...livroValido, dimensoes: undefined },
      cepDestino: '20040020'
    }),
    { status: 422 }
  );
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: livroValido,
      cepDestino: '123'
    }),
    { status: 400 }
  );
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: livroValido,
      cepDestino: ['20040020']
    }),
    { status: 400 }
  );
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: { ...livroValido, preco: Number.NaN },
      cepDestino: '20040020'
    }),
    { status: 422 }
  );
  assert.throws(
    () => criarPayloadCotacaoMelhorEnvio({
      livro: { ...livroValido, preco: null },
      cepDestino: '20040020'
    }),
    { status: 422 }
  );
});

test('normalizes Melhor Envio quotes using the customized price and delivery time', () => {
  assert.deepEqual(normalizarCotacoesMelhorEnvio([{
    id: 1,
    name: 'PAC',
    company: { name: 'Correios' },
    price: '18.50',
    custom_price: '20.00',
    delivery_time: 5,
    custom_delivery_time: 7
  }, {
    id: 2,
    error: 'service unavailable'
  }]), [{
    codigoServico: '1',
    nomeServico: 'Correios - PAC',
    valor: 20,
    prazoEntrega: 7
  }]);
});

test('omits quote entries without a real returned price', () => {
  assert.deepEqual(normalizarCotacoesMelhorEnvio([{
    id: 1,
    name: 'PAC',
    company: { name: 'Correios' },
    price: null,
    custom_price: null,
    delivery_time: 5
  }]), []);
});

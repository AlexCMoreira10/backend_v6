import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geocodificarEndereco,
  montarConsultaEndereco
} from '../src/services/geocodingService.js';

const resultadoValido = {
  status: 'OK',
  results: [{
    partial_match: false,
    address_components: [{ types: ['country'], short_name: 'BR' }],
    geometry: {
      location_type: 'ROOFTOP',
      location: { lat: -23.55052, lng: -46.63331 }
    }
  }]
};

test('builds a geocoding query from address and postal code without using device GPS', () => {
  assert.equal(
    montarConsultaEndereco({
      rua: 'Rua A',
      numero: '10',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01000-000'
    }),
    'Rua A, 10, São Paulo, SP, 01000-000, Brasil'
  );
});

test('returns rounded GeoJSON coordinates only for reliable Brazilian results', async () => {
  let urlRecebida;
  const resultado = await geocodificarEndereco(
    { cep: '01000-000' },
    {
      apiKey: 'test-key',
      fetchImpl: async url => {
        urlRecebida = new URL(url);
        return { ok: true, json: async () => resultadoValido };
      }
    }
  );

  assert.equal(urlRecebida.searchParams.get('components'), 'country:BR');
  assert.deepEqual(resultado, {
    geocode: { type: 'Point', coordinates: [-46.6333, -23.5505] },
    aviso: null
  });
});

test('clears geocode rather than returning an unreliable or unconfigured location', async () => {
  const semConfiguracao = await geocodificarEndereco({ cep: '01000-000' }, { apiKey: '' });
  const resultadoImpreciso = await geocodificarEndereco(
    { cep: '01000-000' },
    {
      apiKey: 'test-key',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ...resultadoValido,
          results: [{ ...resultadoValido.results[0], partial_match: true }]
        })
      })
    }
  );

  assert.equal(semConfiguracao.geocode, null);
  assert.match(semConfiguracao.aviso, /não configurada/);
  assert.equal(resultadoImpreciso.geocode, null);
  assert.match(resultadoImpreciso.aviso, /coordenadas antigas serão removidas/);
});

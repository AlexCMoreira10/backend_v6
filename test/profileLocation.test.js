import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarDadosLocalizacaoAnuncio,
  mesmoEnderecoLocalizacao,
  mesmoGeocode,
  planejarMigracaoLocalizacao
} from '../src/utils/profileLocation.js';

const geocode = { type: 'Point', coordinates: [-46.63, -23.55] };

test('detects only meaningful address and coordinate changes', () => {
  const endereco = { rua: 'Rua A', numero: '10', bairro: 'Centro', cep: '01000-000' };
  assert.equal(mesmoEnderecoLocalizacao(endereco, { ...endereco, rua: ' rua a ' }), true);
  assert.equal(mesmoEnderecoLocalizacao(endereco, { ...endereco, cep: '02000-000' }), false);
  assert.equal(mesmoGeocode(geocode, { type: 'Point', coordinates: [...geocode.coordinates] }), true);
  assert.equal(mesmoGeocode(geocode, null), false);
  assert.equal(mesmoGeocode(null, undefined), true);
});

test('creates ad location only from profile CEP and removes missing profile coordinates', () => {
  assert.deepEqual(
    criarDadosLocalizacaoAnuncio({
      endereco: { cep: ' 01000-000 ' },
      geocode
    }, 3),
    {
      localizacao: '01000-000',
      localizacaoVersaoPerfil: 3,
      geocode
    }
  );
  assert.deepEqual(
    criarDadosLocalizacaoAnuncio({ endereco: { cep: '02000-000' }, geocode: null }, 4),
    {
      localizacao: '02000-000',
      localizacaoVersaoPerfil: 4,
      geocode: null
    }
  );
});

test('migration updates only geocoded user ads and preserves sebos and legacy ads', () => {
  const livros = [
    { id: 'stale', usuarioId: 'u1', geocode: { type: 'Point', coordinates: [0, 0] } },
    { id: 'without-geo', usuarioId: 'u1' },
    { id: 'sebo', usuarioId: 's1', seboId: 's1', geocode },
    { id: 'unchanged', usuarioId: 'u1', geocode, localizacao: '01000-000', localizacaoVersaoPerfil: 2 }
  ];
  const perfis = new Map([
    ['u1', {
      geocode,
      endereco: { cep: '01000-000' },
      localizacaoVersao: 2
    }]
  ]);

  const plano = planejarMigracaoLocalizacao(livros, perfis);

  assert.deepEqual(plano.alteracoes.map(item => item.id), ['stale']);
  assert.equal(plano.totalAfetados, 1);
  assert.equal(plano.sebosIgnorados, 1);
  assert.equal(plano.semCoordenadasIgnorados, 1);
});

test('migration clears stale ad coordinates when the current profile has none', () => {
  const plano = planejarMigracaoLocalizacao(
    [{ id: 'stale', usuarioId: 'u1', geocode }],
    new Map([['u1', { geocode: null, endereco: { cep: '01000-000' } }]])
  );

  assert.equal(plano.totalAfetados, 1);
  assert.equal(plano.alteracoes[0].geocode, null);
});

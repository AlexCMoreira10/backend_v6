import test from 'node:test';
import assert from 'node:assert/strict';
import { removerGeolocalizacaoLivro } from '../src/utils/bookLocationPrivacy.js';

test('removes the seller geolocation from public book data', () => {
  const livro = {
    id: 'livro-1',
    titulo: 'Livro',
    localizacao: '01000-000',
    localizacaoVersaoPerfil: 1,
    geocode: { type: 'Point', coordinates: [-46.6, -23.5] }
  };

  assert.deepEqual(removerGeolocalizacaoLivro(livro), {
    id: 'livro-1',
    titulo: 'Livro'
  });
  assert.ok(livro.geocode);
});

test('preserves commercial sebo location while removing its coordinates', () => {
  const livroPublico = removerGeolocalizacaoLivro({
    id: 'livro-sebo',
    seboId: 'sebo-1',
    localizacao: 'Loja Centro, estante A',
    geocode: { type: 'Point', coordinates: [-46.6, -23.5] }
  });

  assert.equal(livroPublico.localizacao, 'Loja Centro, estante A');
  assert.equal(Object.hasOwn(livroPublico, 'geocode'), false);
});

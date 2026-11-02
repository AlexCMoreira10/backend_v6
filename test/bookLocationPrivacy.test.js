import test from 'node:test';
import assert from 'node:assert/strict';
import { removerGeolocalizacaoLivro } from '../src/utils/bookLocationPrivacy.js';

test('removes the seller geolocation from public book data', () => {
  const livro = {
    id: 'livro-1',
    titulo: 'Livro',
    geocode: { type: 'Point', coordinates: [-46.6, -23.5] }
  };

  assert.deepEqual(removerGeolocalizacaoLivro(livro), {
    id: 'livro-1',
    titulo: 'Livro'
  });
  assert.ok(livro.geocode);
});

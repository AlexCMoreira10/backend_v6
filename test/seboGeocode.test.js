import test from 'node:test';
import assert from 'node:assert/strict';
import { copiarGeocodeSebo } from '../src/utils/seboGeocode.js';

test('copies the sebo GeoJSON point preserving longitude-latitude order', () => {
  const geocode = { type: 'Point', coordinates: [-46.6333, -23.5505] };
  const copia = copiarGeocodeSebo(geocode);

  assert.deepEqual(copia, geocode);
  assert.notEqual(copia, geocode);
  assert.notEqual(copia.coordinates, geocode.coordinates);
});

test('allows sebos without registered geolocation', () => {
  assert.equal(copiarGeocodeSebo(undefined), undefined);
  assert.equal(copiarGeocodeSebo(null), undefined);
});

test('rejects invalid sebo geolocation instead of saving incorrect coordinates', () => {
  assert.throws(
    () => copiarGeocodeSebo({ type: 'Point', coordinates: [-181, 0] }),
    /geolocalização.*inválida/
  );
  assert.throws(
    () => copiarGeocodeSebo({ type: 'Point', coordinates: [-46, 91] }),
    /geolocalização.*inválida/
  );
  assert.throws(
    () => copiarGeocodeSebo({ type: 'Polygon', coordinates: [] }),
    /geolocalização.*inválida/
  );
});

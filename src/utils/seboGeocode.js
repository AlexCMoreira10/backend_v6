export const geocodeSeboValido = geocode =>
  geocode?.type === 'Point' &&
  Array.isArray(geocode.coordinates) &&
  geocode.coordinates.length === 2 &&
  Number.isFinite(geocode.coordinates[0]) &&
  geocode.coordinates[0] >= -180 &&
  geocode.coordinates[0] <= 180 &&
  Number.isFinite(geocode.coordinates[1]) &&
  geocode.coordinates[1] >= -90 &&
  geocode.coordinates[1] <= 90;

const copiarGeocodeValidado = (geocode, mensagemErro) => {
  if (geocode === undefined || geocode === null) return undefined;
  if (!geocodeSeboValido(geocode)) throw new Error(mensagemErro);
  return { type: 'Point', coordinates: [...geocode.coordinates] };
};

export const copiarGeocodeSebo = geocode =>
  copiarGeocodeValidado(geocode, 'A geolocalização cadastrada para o sebo é inválida');

export const copiarGeocodeUsuario = geocode =>
  copiarGeocodeValidado(geocode, 'A geolocalização cadastrada para o usuário é inválida');

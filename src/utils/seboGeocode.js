const copiarGeocodeValidado = (geocode, mensagemErro) => {
  if (geocode === undefined || geocode === null) return undefined;
  const { type, coordinates } = geocode;
  if (
    type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !Number.isFinite(coordinates[0]) ||
    coordinates[0] < -180 ||
    coordinates[0] > 180 ||
    !Number.isFinite(coordinates[1]) ||
    coordinates[1] < -90 ||
    coordinates[1] > 90
  ) {
    throw new Error(mensagemErro);
  }
  return { type: 'Point', coordinates: [...coordinates] };
};

export const copiarGeocodeSebo = geocode =>
  copiarGeocodeValidado(geocode, 'A geolocalização cadastrada para o sebo é inválida');

export const copiarGeocodeUsuario = geocode =>
  copiarGeocodeValidado(geocode, 'A geolocalização cadastrada para o usuário é inválida');

export const criarGeocodificadorSimulado = ({
  geocode = { type: 'Point', coordinates: [-46.63, -23.55] },
  aviso = null
} = {}) => async () => ({
  geocode: structuredClone(geocode),
  aviso
});

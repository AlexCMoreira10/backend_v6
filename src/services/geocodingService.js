const API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const PRECISOES_CONFIAVEIS = new Set([
  'ROOFTOP',
  'RANGE_INTERPOLATED',
  'GEOMETRIC_CENTER',
  'APPROXIMATE'
]);

export const montarConsultaEndereco = (endereco = {}) => {
  const linhas = [
    [endereco.rua, endereco.numero].filter(Boolean).join(', '),
    endereco.bairro,
    [endereco.cidade, endereco.estado].filter(Boolean).join(', '),
    endereco.cep,
    'Brasil'
  ].filter(Boolean);

  return linhas.join(', ');
};

export const geocodificarEndereco = async (
  endereco,
  { apiKey = process.env.GOOGLE_GEOCODING_API_KEY, fetchImpl = fetch } = {}
) => {
  if (!apiKey) {
    return {
      geocode: null,
      aviso: 'Geocodificação não configurada; as coordenadas antigas serão removidas dos anúncios.'
    };
  }

  const address = montarConsultaEndereco(endereco);
  if (!address || address === 'Brasil') {
    return { geocode: null, aviso: 'Informe um endereço ou CEP para geocodificar.' };
  }

  const url = new URL(API_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('components', 'country:BR');
  url.searchParams.set('key', apiKey);

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`O serviço de geocodificação respondeu com HTTP ${response.status}`);
  }

  const resultado = await response.json();
  const item = resultado.results?.[0];
  const paisBrasil = item?.address_components?.some(componente =>
    componente.types?.includes('country') && componente.short_name === 'BR'
  );
  if (
    resultado.status !== 'OK' ||
    !item ||
    !paisBrasil ||
    !PRECISOES_CONFIAVEIS.has(item.geometry?.location_type) ||
    item.partial_match
  ) {
    return {
      geocode: null,
      aviso: 'Não foi possível confirmar uma localização aproximada confiável; as coordenadas antigas serão removidas dos anúncios.'
    };
  }

  const latitude = Number(item.geometry.location.lat);
  const longitude = Number(item.geometry.location.lng);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return {
      geocode: null,
      aviso: 'O serviço retornou coordenadas inválidas; as coordenadas antigas serão removidas dos anúncios.'
    };
  }

  return {
    geocode: {
      type: 'Point',
      coordinates: [
        Math.round(longitude * 10000) / 10000,
        Math.round(latitude * 10000) / 10000
      ]
    },
    aviso: null
  };
};

const EARTH_RADIUS_KM = 6371.0088;

export const validarPonto = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

export const obterCoordenadasGeocode = (geocode) => {
  const coordinates = geocode?.coordinates;
  if (
    geocode?.type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !validarPonto(coordinates[1], coordinates[0])
  ) {
    return null;
  }
  return { latitude: coordinates[1], longitude: coordinates[0] };
};

export const calcularDistanciaKm = (origem, destino) => {
  const latitudeOrigem = origem.latitude * Math.PI / 180;
  const latitudeDestino = destino.latitude * Math.PI / 180;
  const diferencaLatitude = (destino.latitude - origem.latitude) * Math.PI / 180;
  const diferencaLongitude = (destino.longitude - origem.longitude) * Math.PI / 180;
  const a = Math.sin(diferencaLatitude / 2) ** 2 +
    Math.cos(latitudeOrigem) *
    Math.cos(latitudeDestino) *
    Math.sin(diferencaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, a)));
};

export const validarRaioKm = raioKm =>
  [3, 5, 10].includes(Number(raioKm));

export const filtrarLivrosProximos = ({
  livros,
  origem,
  raioKm,
  perfisPorId,
  filtros = {},
  page = 1,
  limit = 16
}) => {
  const raio = Number(raioKm);
  if (!validarRaioKm(raio)) {
    throw new Error('O raio deve ser 3, 5 ou 10 km');
  }
  if (!validarPonto(origem?.latitude, origem?.longitude)) {
    throw new Error('Informe latitude e longitude válidas');
  }

  const resultados = livros.flatMap(livro => {
    const ponto = obterCoordenadasGeocode(livro.geocode);
    if (!ponto || livro.status === 'na_estante' ||
        ['roubado', 'perdido'].includes(livro.estadoAcervo)) {
      return [];
    }

    if (!livro.seboId) {
      const perfil = perfisPorId.get(livro.usuarioId);
      if (!perfil || perfil.localizacaoSyncStatus === 'pendente') return [];
      const versaoPerfil = Number(perfil.localizacaoVersao) || 0;
      const versaoLivro = Number(livro.localizacaoVersaoPerfil) || 0;
      if (versaoLivro !== versaoPerfil) return [];
    }

    if (filtros.tipo && livro.tipo !== filtros.tipo) return [];
    if (
      filtros.titulo &&
      !String(livro.titulo || '').toLocaleLowerCase('pt-BR')
        .includes(String(filtros.titulo).trim().toLocaleLowerCase('pt-BR'))
    ) {
      return [];
    }

    const distancia = calcularDistanciaKm(origem, ponto);
    if (distancia > raio) return [];

    return [{ ...livro, distanciaKm: Math.round(distancia * 10) / 10, distanciaExataKm: distancia }];
  });

  resultados.sort((a, b) =>
    a.distanciaExataKm - b.distanciaExataKm ||
    String(a.id).localeCompare(String(b.id))
  );
  resultados.forEach(livro => { delete livro.distanciaExataKm; });

  const pagina = Math.max(Number.parseInt(page, 10) || 1, 1);
  const tamanhoPagina = Math.min(Math.max(Number.parseInt(limit, 10) || 16, 1), 100);
  const total = resultados.length;
  const inicio = (pagina - 1) * tamanhoPagina;

  return {
    total,
    page: pagina,
    limit: tamanhoPagina,
    totalPaginas: Math.ceil(total / tamanhoPagina),
    dados: resultados.slice(inicio, inicio + tamanhoPagina)
  };
};

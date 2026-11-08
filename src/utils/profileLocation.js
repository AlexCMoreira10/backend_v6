import { obterCoordenadasGeocode } from './geoDistance.js';

const CAMPOS_ENDERECO_LOCALIZACAO = [
  'rua',
  'numero',
  'bairro',
  'cidade',
  'estado',
  'cep'
];

const normalizarTexto = valor => String(valor ?? '').trim().toLocaleLowerCase('pt-BR');

export const mesmoEnderecoLocalizacao = (enderecoA = {}, enderecoB = {}) =>
  CAMPOS_ENDERECO_LOCALIZACAO.every(campo =>
    normalizarTexto(enderecoA[campo]) === normalizarTexto(enderecoB[campo])
  );

export const mesmoGeocode = (geocodeA, geocodeB) =>
  (!geocodeA && !geocodeB) ||
  (geocodeA?.type === geocodeB?.type &&
  Array.isArray(geocodeA?.coordinates) &&
  Array.isArray(geocodeB?.coordinates) &&
  geocodeA.coordinates.length === 2 &&
  geocodeB.coordinates.length === 2 &&
  geocodeA.coordinates[0] === geocodeB.coordinates[0] &&
  geocodeA.coordinates[1] === geocodeB.coordinates[1]);

export const criarDadosLocalizacaoAnuncio = (perfil, versao) => {
  const geocode = obterCoordenadasGeocode(perfil.geocode)
    ? {
        type: 'Point',
        coordinates: [...perfil.geocode.coordinates]
      }
    : null;

  return {
    localizacao: String(perfil.endereco?.cep || '').trim(),
    localizacaoVersaoPerfil: versao,
    geocode
  };
};

export const planejarMigracaoLocalizacao = (livros, perfisPorId) => {
  const alteracoes = [];
  let sebosIgnorados = 0;
  let semCoordenadasIgnorados = 0;
  let semPerfilIgnorados = 0;

  for (const livro of livros) {
    if (livro.seboId) {
      sebosIgnorados += 1;
      continue;
    }
    if (!obterCoordenadasGeocode(livro.geocode)) {
      semCoordenadasIgnorados += 1;
      continue;
    }

    const perfil = perfisPorId.get(livro.usuarioId);
    if (!perfil) {
      semPerfilIgnorados += 1;
      continue;
    }

    const geocodeAtual = obterCoordenadasGeocode(perfil.geocode)
      ? perfil.geocode
      : null;
    const versao = Number(perfil.localizacaoVersao) || 0;
    const localizacaoMudou =
      !mesmoGeocode(livro.geocode, geocodeAtual) ||
      String(livro.localizacao || '') !== String(perfil.endereco?.cep || '') ||
      Number(livro.localizacaoVersaoPerfil || 0) !== versao;

    if (localizacaoMudou) {
      alteracoes.push({
        id: livro.id,
        usuarioId: livro.usuarioId,
        geocode: geocodeAtual,
        localizacao: String(perfil.endereco?.cep || '').trim(),
        localizacaoVersaoPerfil: versao
      });
    }
  }

  return {
    alteracoes,
    totalAfetados: alteracoes.length,
    sebosIgnorados,
    semCoordenadasIgnorados,
    semPerfilIgnorados
  };
};

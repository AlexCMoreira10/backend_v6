import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularDistanciaKm,
  filtrarLivrosProximos,
  obterCoordenadasGeocode,
  validarPonto,
  validarRaioKm
} from '../src/utils/geoDistance.js';

const origem = { latitude: 0, longitude: 0 };
const pontoGeoJson = longitude => ({
  type: 'Point',
  coordinates: [longitude, 0]
});

const criarLivro = (id, longitude, outros = {}) => ({
  id,
  titulo: `Livro ${id}`,
  usuarioId: 'usuario-1',
  tipo: 'troca',
  status: 'disponivel',
  geocode: pontoGeoJson(longitude),
  ...outros
});

const perfisPorId = new Map([
  ['usuario-1', { localizacaoVersao: 0, localizacaoSyncStatus: 'sincronizado' }]
]);

test('validates coordinates and follows GeoJSON longitude-latitude order', () => {
  assert.equal(validarPonto(90, 180), true);
  assert.equal(validarPonto(91, 0), false);
  assert.deepEqual(obterCoordenadasGeocode(pontoGeoJson(10)), {
    latitude: 0,
    longitude: 10
  });
  assert.equal(obterCoordenadasGeocode({ type: 'Point', coordinates: [181, 0] }), null);
});

test('calculates Haversine distance in kilometers', () => {
  assert.ok(Math.abs(calcularDistanciaKm(origem, { latitude: 0, longitude: 0.01 }) - 1.11195) < 0.002);
});

test('allows only the approved proximity radii', () => {
  assert.equal(validarRaioKm(3), true);
  assert.equal(validarRaioKm('5'), true);
  assert.equal(validarRaioKm(10), true);
  assert.equal(validarRaioKm(4), false);
});

test('includes locations at each selected radius and excludes locations outside it', () => {
  for (const raioKm of [3, 5, 10]) {
    const longitudeDentro = (raioKm - 0.1) / 111.195;
    const longitudeFora = (raioKm + 0.1) / 111.195;
    const resultado = filtrarLivrosProximos({
      livros: [
        criarLivro('inside', longitudeDentro),
        criarLivro('outside', longitudeFora)
      ],
      origem,
      raioKm,
      perfisPorId
    });

    assert.deepEqual(resultado.dados.map(livro => livro.id), ['inside']);
  }
});

test('filters by radius, title, type and status, then sorts by distance', () => {
  const livros = [
    criarLivro('far', 0.08),
    criarLivro('near', 0.01),
    criarLivro('middle', 0.04),
    criarLivro('missing', 0.01, { geocode: undefined }),
    criarLivro('archived', 0.01, { status: 'na_estante' }),
    criarLivro('lost', 0.01, { estadoAcervo: 'perdido' }),
    criarLivro('pending', 0.01, { localizacaoVersaoPerfil: 2 }),
    criarLivro('wrong-type', 0.01, { tipo: 'venda' })
  ];

  const resultado = filtrarLivrosProximos({
    livros,
    origem,
    raioKm: 5,
    perfisPorId,
    filtros: { titulo: 'middle', tipo: 'troca' }
  });

  assert.deepEqual(resultado.dados.map(livro => livro.id), ['middle']);
  assert.ok(resultado.dados[0].distanciaKm > 4);
});

test('applies pagination after radius filtering and distance ordering', () => {
  const resultado = filtrarLivrosProximos({
    livros: [criarLivro('far', 0.08), criarLivro('near', 0.01), criarLivro('middle', 0.04)],
    origem,
    raioKm: 5,
    perfisPorId,
    page: 2,
    limit: 1
  });

  assert.equal(resultado.total, 2);
  assert.equal(resultado.totalPaginas, 2);
  assert.equal(resultado.dados[0].id, 'middle');
});

test('excludes users with pending location synchronization and includes sebo locations', () => {
  const perfis = new Map([
    ['usuario-1', { localizacaoVersao: 0, localizacaoSyncStatus: 'pendente' }]
  ]);
  const resultado = filtrarLivrosProximos({
    livros: [
      criarLivro('pending-user', 0.01),
      criarLivro('sebo', 0.02, { usuarioId: 'sebo-1', seboId: 'sebo-1' })
    ],
    origem,
    raioKm: 3,
    perfisPorId: perfis
  });

  assert.deepEqual(resultado.dados.map(livro => livro.id), ['sebo']);
});

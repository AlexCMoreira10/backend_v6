import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, FieldPath, FieldValue } from './admin.js';
import { criarGeocodificadorSimulado } from './geocodingMock.js';
import { criarSincronizadorLocalizacaoSebo } from '../../src/services/seboLocationSyncService.js';
import { criarAtualizadorSebo } from '../../src/services/seboProfileService.js';
import { criarRouterMeuSebo } from '../../src/routes/seboMeRouter.js';

const pontoAntigo = { type: 'Point', coordinates: [-46.63, -23.55] };
const pontoNovo = { type: 'Point', coordinates: [-46.64, -23.56] };
const enderecoInicial = {
  rua: 'Rua HTTP de Teste',
  numero: '10',
  complemento: '',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01000-000'
};
const enderecoNovo = {
  ...enderecoInicial,
  rua: 'Avenida HTTP de Teste',
  cep: '02000-000'
};
const horario = {
  segunda: { abre: '08:00', fecha: '18:00' },
  terca: { abre: '08:00', fecha: '18:00' },
  quarta: { abre: '08:00', fecha: '18:00' },
  quinta: { abre: '08:00', fecha: '18:00' },
  sexta: { abre: '08:00', fecha: '18:00' },
  sabado: null,
  domingo: null
};

const gerarUid = () => `http-integration-${randomUUID()}`;
const obterPerfil = uid => db.collection('sebos').doc(uid).get();
const obterLivro = id => db.collection('livros').doc(id).get();

const criarPerfil = (uid, sobrescritos = {}) => ({
  _id: uid,
  uid,
  nome: 'Sebo HTTP de Teste',
  email: `${uid}@example.invalid`,
  cnpj: '20.182.807/0004-42',
  telefone: ['(11) 99999-9999'],
  endereco: enderecoInicial,
  horario_funcionamento: horario,
  geocode: pontoAntigo,
  localizacaoVersao: 3,
  localizacaoSyncStatus: 'sincronizado',
  ...sobrescritos
});

const montarServidorTeste = () => {
  const sincronizarLocalizacaoSebo = criarSincronizadorLocalizacaoSebo({
    db,
    deleteField: () => FieldValue.delete(),
    documentIdFieldPath: FieldPath.documentId(),
    geocodificarEndereco: criarGeocodificadorSimulado({ geocode: pontoNovo }),
    batchSize: 1,
    maxBatchesPerRequest: 1,
    logger: { error() {} }
  });
  const atualizarSebo = criarAtualizadorSebo({
    db,
    deleteField: () => FieldValue.delete(),
    sincronizarLocalizacao: sincronizarLocalizacaoSebo
  });

  const verificarTokenSebo = async (req, res, next) => {
    const bearer = req.get('authorization');
    if (!bearer?.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const token = bearer.slice(7);
    if (token === 'common-user-token') {
      return res.status(403).json({ erro: 'A conta autenticada não é gestora de um sebo' });
    }
    if (!token.startsWith('manager-token:')) {
      return res.status(401).json({ erro: 'Token inválido' });
    }

    const uid = token.slice('manager-token:'.length);
    const snapshot = await obterPerfil(uid);
    if (!snapshot.exists) {
      return res.status(403).json({ erro: 'A conta autenticada não é gestora de um sebo' });
    }
    req.usuario = { uid, email: snapshot.data().email };
    req.seboId = uid;
    req.subconta = null;
    return next();
  };
  const exigirGestorSebo = (req, res, next) => {
    if (req.subconta) {
      return res.status(403).json({ erro: 'Somente o gestor do sebo pode gerenciar subcontas' });
    }
    return next();
  };
  const buscarMeuSebo = async (req, res) => {
    const snapshot = await obterPerfil(req.usuario.uid);
    if (!snapshot.exists) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    return res.json({ id: snapshot.id, ...snapshot.data() });
  };
  const atualizarMeuSebo = async (req, res) => {
    try {
      const sebo = await atualizarSebo(req.seboId, req.body);
      if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
      return res.json(sebo);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ erro: error.message });
      return res.status(500).json({ erro: 'Não foi possível atualizar o cadastro do sebo' });
    }
  };
  const sincronizarLocalizacaoMeuSebo = async (req, res) => {
    try {
      const resultado = await sincronizarLocalizacaoSebo(req.seboId);
      if (!resultado) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
      return res.json(resultado);
    } catch {
      return res.status(500).json({
        erro: 'Não foi possível retomar a sincronização da localização'
      });
    }
  };

  const app = express();
  app.use(express.json());
  app.use('/api', criarRouterMeuSebo({
    verificarTokenSebo,
    exigirGestorSebo,
    buscarMeuSebo,
    atualizarMeuSebo,
    sincronizarLocalizacaoMeuSebo
  }));
  return app;
};

const requisitar = (baseUrl, path, { token, ...options } = {}) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...options.headers
  }
});

const criarLivros = async (seboId, quantidade) => {
  const ids = Array.from({ length: quantidade }, (_, indice) =>
    `${seboId}-book-${String(indice).padStart(3, '0')}`
  );
  const batch = db.batch();
  for (const id of ids) {
    batch.set(db.collection('livros').doc(id), {
      seboId,
      titulo: id,
      status: 'disponivel',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 2
    });
  }
  await batch.commit();
  return ids;
};

const limparFixture = async (seboIds, bookIds) => {
  for (let inicio = 0; inicio < bookIds.length; inicio += 400) {
    const batch = db.batch();
    for (const id of bookIds.slice(inicio, inicio + 400)) {
      batch.delete(db.collection('livros').doc(id));
    }
    await batch.commit();
  }
  await Promise.all(seboIds.map(uid => db.collection('sebos').doc(uid).delete()));
};

test('HTTP sebo profile routes enforce access, update allowed data, and persist sync state', async () => {
  const gestorId = gerarUid();
  const outroGestorId = gerarUid();
  const gestorRef = db.collection('sebos').doc(gestorId);
  const outroGestorRef = db.collection('sebos').doc(outroGestorId);
  let bookIds = [];
  const server = montarServidorTeste().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tokenGestor = `manager-token:${gestorId}`;
  const tokenOutroGestor = `manager-token:${outroGestorId}`;

  try {
    await Promise.all([
      gestorRef.set(criarPerfil(gestorId)),
      outroGestorRef.set(criarPerfil(outroGestorId, { nome: 'Outro Sebo Privado' }))
    ]);

    const semToken = await requisitar(baseUrl, '/api/sebos/me');
    assert.equal(semToken.status, 401);

    const contaComum = await requisitar(baseUrl, '/api/sebos/me', {
      token: 'common-user-token'
    });
    assert.equal(contaComum.status, 403);

    const perfilResponse = await requisitar(baseUrl, '/api/sebos/me', {
      token: tokenGestor
    });
    assert.equal(perfilResponse.status, 200);
    const perfilJson = await perfilResponse.json();
    assert.equal(perfilJson.id, gestorId);
    assert.equal(perfilJson.uid, gestorId);
    assert.equal(perfilJson.nome, 'Sebo HTTP de Teste');
    assert.notEqual(perfilJson.uid, outroGestorId);
    assert.notEqual(perfilJson.nome, 'Outro Sebo Privado');

    const semTokenPatch = await requisitar(baseUrl, '/api/sebos/me', {
      method: 'PATCH',
      body: JSON.stringify({ nome: 'Sem autenticação' })
    });
    assert.equal(semTokenPatch.status, 401);

    const patchComum = await requisitar(baseUrl, '/api/sebos/me', {
      method: 'PATCH',
      token: 'common-user-token',
      body: JSON.stringify({ nome: 'Tentativa indevida' })
    });
    assert.equal(patchComum.status, 403);

    const patchPermitido = await requisitar(baseUrl, '/api/sebos/me', {
      method: 'PATCH',
      token: tokenGestor,
      body: JSON.stringify({
        nome: 'Sebo HTTP Atualizado',
        telefone: ['(11) 98888-7777'],
        endereco: enderecoNovo
      })
    });
    assert.equal(patchPermitido.status, 200);
    const patchJson = await patchPermitido.json();
    assert.equal(patchJson.nome, 'Sebo HTTP Atualizado');
    assert.deepEqual(patchJson.telefone, ['(11) 98888-7777']);
    assert.deepEqual(patchJson.endereco, enderecoNovo);
    assert.equal(patchJson.localizacaoVersao, 4);
    assert.equal(patchJson.localizacaoSyncStatus, 'sincronizado');
    assert.deepEqual(patchJson.geocode, pontoNovo);

    const uidProtegido = await requisitar(baseUrl, '/api/sebos/me', {
      method: 'PATCH',
      token: tokenGestor,
      body: JSON.stringify({ uid: outroGestorId })
    });
    assert.equal(uidProtegido.status, 400);

    const cnpjProtegido = await requisitar(baseUrl, '/api/sebos/me', {
      method: 'PATCH',
      token: tokenGestor,
      body: JSON.stringify({ cnpj: '11.222.333/0001-81' })
    });
    assert.equal(cnpjProtegido.status, 400);
    const perfilDepoisDosPatch = (await obterPerfil(gestorId)).data();
    assert.equal(perfilDepoisDosPatch.uid, gestorId);
    assert.equal(perfilDepoisDosPatch.cnpj, '20.182.807/0004-42');

    bookIds = await criarLivros(gestorId, 3);
    await gestorRef.update({ localizacaoSyncStatus: 'pendente' });
    const outroBookId = `${outroGestorId}-book-untouched`;
    const outroBookRef = db.collection('livros').doc(outroBookId);
    await outroBookRef.set({
      seboId: outroGestorId,
      titulo: 'Livro de outro sebo',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 3
    });
    bookIds.push(outroBookId);

    const semTokenSync = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST' }
    );
    assert.equal(semTokenSync.status, 401);

    const contaComumSync = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST', token: 'common-user-token' }
    );
    assert.equal(contaComumSync.status, 403);

    const primeiraSyncResponse = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST', token: tokenGestor }
    );
    assert.equal(primeiraSyncResponse.status, 200);
    const primeiraSync = await primeiraSyncResponse.json();
    assert.equal(primeiraSync.status, 'pendente');
    assert.equal(primeiraSync.versao, 4);
    assert.equal(primeiraSync.anunciosAtualizados, 1);
    const perfilDepoisDaPrimeiraSync = (await obterPerfil(gestorId)).data();
    assert.equal(primeiraSync.continuar, true);
    assert.equal(perfilDepoisDaPrimeiraSync.localizacaoVersao, primeiraSync.versao);
    assert.equal(perfilDepoisDaPrimeiraSync.localizacaoSyncStatus, primeiraSync.status);
    assert.equal(perfilDepoisDaPrimeiraSync.localizacaoSyncCursor, bookIds[0]);
    const livroSincronizado = (await obterLivro(bookIds[0])).data();
    assert.equal(livroSincronizado.localizacaoVersaoPerfil, primeiraSync.versao);
    assert.deepEqual(livroSincronizado.geocode, pontoNovo);
    const livroPendente = (await obterLivro(bookIds[1])).data();
    assert.equal(livroPendente.localizacaoVersaoPerfil, 2);
    assert.deepEqual(livroPendente.geocode, pontoAntigo);
    const livroOutroSebo = (await obterLivro(outroBookId)).data();
    assert.equal(livroOutroSebo.localizacaoVersaoPerfil, 3);
    assert.deepEqual(livroOutroSebo.geocode, pontoAntigo);

    const segundaSyncResponse = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST', token: tokenGestor }
    );
    const segundaSync = await segundaSyncResponse.json();
    assert.equal(segundaSyncResponse.status, 200);
    assert.equal(segundaSync.status, 'pendente');
    assert.equal(segundaSync.anunciosAtualizados, 1);
    assert.equal((await obterPerfil(gestorId)).data().localizacaoSyncCursor, bookIds[1]);

    const terceiraSyncResponse = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST', token: tokenGestor }
    );
    const terceiraSync = await terceiraSyncResponse.json();
    assert.equal(terceiraSyncResponse.status, 200);
    assert.equal(terceiraSync.status, 'pendente');
    assert.equal(terceiraSync.anunciosAtualizados, 1);
    assert.equal((await obterPerfil(gestorId)).data().localizacaoSyncCursor, bookIds[2]);

    const quartaSyncResponse = await requisitar(
      baseUrl,
      '/api/sebos/me/localizacao/sincronizar',
      { method: 'POST', token: tokenGestor }
    );
    const quartaSync = await quartaSyncResponse.json();
    assert.equal(quartaSyncResponse.status, 200);
    assert.equal(quartaSync.status, 'sincronizado');
    assert.equal(quartaSync.versao, 4);
    const perfilConcluido = (await obterPerfil(gestorId)).data();
    assert.equal(perfilConcluido.localizacaoSyncStatus, 'sincronizado');
    assert.equal(Object.hasOwn(perfilConcluido, 'localizacaoSyncCursor'), false);

    for (const id of bookIds.slice(0, 3)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 4);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
    const outroSeboFinal = (await obterLivro(outroBookId)).data();
    assert.equal(outroSeboFinal.localizacaoVersaoPerfil, 3);
    assert.deepEqual(outroSeboFinal.geocode, pontoAntigo);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await limparFixture([gestorId, outroGestorId], bookIds);
  }
});

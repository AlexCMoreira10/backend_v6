import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { db, FieldPath, FieldValue } from './admin.js';
import { criarGeocodificadorSimulado } from './geocodingMock.js';
import { criarSincronizadorLocalizacaoSebo } from '../../src/services/seboLocationSyncService.js';
import { criarAtualizadorSebo } from '../../src/services/seboProfileService.js';

const pontoAntigo = { type: 'Point', coordinates: [-46.63, -23.55] };
const pontoNovo = { type: 'Point', coordinates: [-46.64, -23.56] };
const pontoMaisNovo = { type: 'Point', coordinates: [-46.65, -23.57] };
const enderecoInicial = {
  rua: 'Rua de Teste',
  numero: '10',
  complemento: '',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01000-000'
};
const enderecoNovo = {
  ...enderecoInicial,
  rua: 'Avenida de Teste',
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

const criarSeboId = () => `integration-${randomUUID()}`;

const criarPerfil = (sobrescritos = {}) => ({
  nome: 'Sebo de Integração',
  email: 'integracao@example.invalid',
  cnpj: '20.182.807/0004-42',
  telefone: ['(11) 99999-9999'],
  endereco: enderecoInicial,
  horario_funcionamento: horario,
  geocode: pontoAntigo,
  localizacaoVersao: 4,
  localizacaoSyncStatus: 'sincronizado',
  ...sobrescritos
});

const criarSincronizador = ({
  batchSize = 200,
  maxBatchesPerRequest = 2,
  geocodificarEndereco = criarGeocodificadorSimulado({ geocode: pontoNovo })
} = {}) => criarSincronizadorLocalizacaoSebo({
  db,
  deleteField: () => FieldValue.delete(),
  documentIdFieldPath: FieldPath.documentId(),
  geocodificarEndereco,
  batchSize,
  maxBatchesPerRequest,
  logger: { error() {} }
});

const criarAtualizador = sincronizarLocalizacao => criarAtualizadorSebo({
  db,
  deleteField: () => FieldValue.delete(),
  sincronizarLocalizacao
});

const criarLivros = async (seboId, quantidade, { versao = 3, geocode = pontoAntigo } = {}) => {
  const ids = Array.from({ length: quantidade }, (_, indice) =>
    `book-${String(indice).padStart(4, '0')}`
  );
  for (let inicio = 0; inicio < ids.length; inicio += 400) {
    const batch = db.batch();
    for (const id of ids.slice(inicio, inicio + 400)) {
      batch.set(db.collection('livros').doc(`${seboId}-${id}`), {
        seboId,
        titulo: id,
        status: 'disponivel',
        geocode,
        localizacaoVersaoPerfil: versao
      });
    }
    await batch.commit();
  }
  return ids.map(id => `${seboId}-${id}`);
};

const limparFixture = async (seboId, bookIds = []) => {
  for (let inicio = 0; inicio < bookIds.length; inicio += 400) {
    const batch = db.batch();
    for (const id of bookIds.slice(inicio, inicio + 400)) {
      batch.delete(db.collection('livros').doc(id));
    }
    await batch.commit();
  }
  await db.collection('sebos').doc(seboId).delete();
};

const obterLivro = id => db.collection('livros').doc(id).get();
const obterSebo = id => db.collection('sebos').doc(id).get();

const aguardarSinal = () => {
  let sinalizar;
  const promise = new Promise(resolve => { sinalizar = resolve; });
  return { promise, sinalizar };
};

let servicoCriacao;
const carregarServicoCriacao = async () => {
  if (servicoCriacao) return servicoCriacao;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_CLIENT_EMAIL ||
      process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Credenciais externas presentes antes de carregar o fluxo de criação.');
  }

  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  process.env.FIREBASE_PROJECT_ID = 'demo-estante-babel';
  process.env.FIREBASE_CLIENT_EMAIL =
    'emulator-test@demo-estante-babel.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = privateKey;
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';

  try {
    servicoCriacao = await import('../../src/services/livroCreationService.js');
    return servicoCriacao;
  } finally {
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  }
};

const limparLivrosCriadosPeloServico = async bookIds => {
  for (const id of bookIds) {
    const historico = await db.collection('livros').doc(id)
      .collection('historicoPosse').get();
    for (let inicio = 0; inicio < historico.docs.length; inicio += 400) {
      const batch = db.batch();
      for (const doc of historico.docs.slice(inicio, inicio + 400)) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
    await db.collection('estante').doc(id).delete();
  }
  await Promise.all(bookIds.map(id => db.collection('livros').doc(id).delete()));
};

test('address updates increment location version and clear old coordinates before geocoding', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  let geocodingCalls = 0;
  let perfilDuranteGeocodificacao;
  const geocodificarEndereco = async endereco => {
    geocodingCalls += 1;
    perfilDuranteGeocodificacao = (await seboRef.get()).data();
    return criarGeocodificadorSimulado({ geocode: pontoNovo })(endereco);
  };
  const sincronizarLocalizacao = criarSincronizador({ geocodificarEndereco });
  const atualizarSebo = criarAtualizador(sincronizarLocalizacao);

  await seboRef.set(criarPerfil());
  try {
    const semMudancaDeEndereco = await atualizarSebo(seboId, {
      nome: 'Sebo Atualizado',
      telefone: ['(11) 98888-7777']
    });
    assert.equal(semMudancaDeEndereco.localizacaoVersao, 4);
    assert.equal(semMudancaDeEndereco.localizacaoSyncStatus, 'sincronizado');
    assert.deepEqual(semMudancaDeEndereco.geocode, pontoAntigo);
    assert.equal(geocodingCalls, 0);

    const atualizado = await atualizarSebo(seboId, { endereco: enderecoNovo });
    assert.equal(atualizado.localizacaoVersao, 5);
    assert.equal(atualizado.localizacaoSyncStatus, 'sincronizado');
    assert.equal(geocodingCalls, 1);
    assert.equal(perfilDuranteGeocodificacao.localizacaoVersao, 5);
    assert.equal(perfilDuranteGeocodificacao.localizacaoSyncStatus, 'pendente');
    assert.equal(Object.hasOwn(perfilDuranteGeocodificacao, 'geocode'), false);
    assert.deepEqual(atualizado.geocode, pontoNovo);

    const persistido = (await obterSebo(seboId)).data();
    assert.equal(persistido.localizacaoVersao, 5);
    assert.deepEqual(persistido.geocode, pontoNovo);
    assert.notDeepEqual(persistido.geocode, pontoAntigo);
  } finally {
    await limparFixture(seboId);
  }
});

test('processes no more than two 200-book batches per request and persists cursor/version', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  let bookIds = [];
  await seboRef.set(criarPerfil({
    geocode: pontoNovo,
    localizacaoVersao: 8,
    localizacaoSyncStatus: 'pendente'
  }));
  try {
    bookIds = await criarLivros(seboId, 405, { versao: 7 });
    const sincronizar = criarSincronizador();

    const primeiraRequisicao = await sincronizar(seboId);
    assert.equal(primeiraRequisicao.status, 'pendente');
    assert.equal(primeiraRequisicao.continuar, true);
    assert.equal(primeiraRequisicao.anunciosAtualizados, 400);

    let perfil = (await obterSebo(seboId)).data();
    assert.equal(perfil.localizacaoVersao, 8);
    assert.equal(perfil.localizacaoSyncStatus, 'pendente');
    assert.equal(perfil.localizacaoSyncCursor, bookIds[399]);
    for (const id of bookIds.slice(0, 400)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 8);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
    for (const id of bookIds.slice(400)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 7);
      assert.deepEqual(livro.geocode, pontoAntigo);
    }

    const segundaRequisicao = await sincronizar(seboId);
    assert.equal(segundaRequisicao.status, 'sincronizado');
    assert.equal(segundaRequisicao.anunciosAtualizados, 5);
    perfil = (await obterSebo(seboId)).data();
    assert.equal(perfil.localizacaoSyncStatus, 'sincronizado');
    assert.equal(Object.hasOwn(perfil, 'localizacaoSyncCursor'), false);

    for (const id of bookIds) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 8);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
  } finally {
    await limparFixture(seboId, bookIds);
  }
});

test('a fresh synchronizer resumes from the committed cursor after interruption', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  let bookIds = [];
  await seboRef.set(criarPerfil({
    geocode: pontoNovo,
    localizacaoVersao: 12,
    localizacaoSyncStatus: 'pendente'
  }));
  try {
    bookIds = await criarLivros(seboId, 250, { versao: 11 });
    const primeiraInstancia = criarSincronizador({ maxBatchesPerRequest: 1 });
    const primeiraExecucao = await primeiraInstancia(seboId);

    assert.equal(primeiraExecucao.status, 'pendente');
    assert.equal(primeiraExecucao.anunciosAtualizados, 200);
    const perfilAposInterrupcao = (await obterSebo(seboId)).data();
    assert.equal(perfilAposInterrupcao.localizacaoSyncCursor, bookIds[199]);
    assert.equal(perfilAposInterrupcao.localizacaoVersao, 12);

    const novaInstancia = criarSincronizador({ maxBatchesPerRequest: 1 });
    const retomada = await novaInstancia(seboId);
    assert.equal(retomada.status, 'pendente');
    assert.equal(retomada.anunciosAtualizados, 50);
    assert.equal((await obterSebo(seboId)).data().localizacaoSyncCursor, bookIds[249]);
    assert.equal((await obterLivro(bookIds[199])).data().localizacaoVersaoPerfil, 12);
    assert.equal((await obterLivro(bookIds[200])).data().localizacaoVersaoPerfil, 12);

    const conclusao = await novaInstancia(seboId);
    assert.equal(conclusao.status, 'sincronizado');
    assert.equal((await obterSebo(seboId)).data().localizacaoSyncStatus, 'sincronizado');

    for (const id of bookIds) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 12);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
  } finally {
    await limparFixture(seboId, bookIds);
  }
});

test('concurrent address edits keep the newest geocode, version, and cursor', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  let bookIds = [];
  const geocodeAntigoPronto = aguardarSinal();
  const liberarGeocodeAntigo = aguardarSinal();
  await seboRef.set(criarPerfil());
  try {
    bookIds = await criarLivros(seboId, 5, { versao: 4 });
    const geocodificarEndereco = async endereco => {
      if (endereco.rua === 'Primeiro endereço concorrente') {
        geocodeAntigoPronto.sinalizar();
        await liberarGeocodeAntigo.promise;
        return { geocode: pontoNovo, aviso: null };
      }
      return { geocode: pontoMaisNovo, aviso: null };
    };
    const sincronizar = criarSincronizador({
      batchSize: 2,
      maxBatchesPerRequest: 1,
      geocodificarEndereco
    });
    const atualizarSebo = criarAtualizador(sincronizar);
    const primeiraAtualizacao = atualizarSebo(seboId, {
      endereco: { ...enderecoNovo, rua: 'Primeiro endereço concorrente' }
    });
    await geocodeAntigoPronto.promise;

    const segundaAtualizacao = await atualizarSebo(seboId, {
      endereco: { ...enderecoNovo, rua: 'Segundo endereço concorrente', cep: '03000-000' }
    });
    assert.equal(segundaAtualizacao.localizacaoVersao, 6);
    assert.equal(segundaAtualizacao.localizacaoSyncStatus, 'pendente');
    const perfilMaisRecente = (await obterSebo(seboId)).data();
    const cursorMaisRecente = perfilMaisRecente.localizacaoSyncCursor;
    assert.equal(cursorMaisRecente, bookIds[1]);
    assert.deepEqual(perfilMaisRecente.geocode, pontoMaisNovo);

    liberarGeocodeAntigo.sinalizar();
    const primeiraResposta = await primeiraAtualizacao;
    assert.equal(primeiraResposta.localizacaoVersao, 6);
    assert.equal(primeiraResposta.localizacaoSyncCursor, cursorMaisRecente);

    const depoisDoGeocodeObsoleto = (await obterSebo(seboId)).data();
    assert.equal(depoisDoGeocodeObsoleto.localizacaoVersao, 6);
    assert.equal(depoisDoGeocodeObsoleto.localizacaoSyncCursor, cursorMaisRecente);
    assert.deepEqual(depoisDoGeocodeObsoleto.geocode, pontoMaisNovo);
    for (const id of bookIds.slice(0, 2)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 6);
      assert.deepEqual(livro.geocode, pontoMaisNovo);
    }

    while ((await obterSebo(seboId)).data().localizacaoSyncStatus !== 'sincronizado') {
      await sincronizar(seboId);
    }
    for (const id of bookIds) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 6);
      assert.deepEqual(livro.geocode, pontoMaisNovo);
    }
  } finally {
    liberarGeocodeAntigo.sinalizar();
    await limparFixture(seboId, bookIds);
  }
});

test('simultaneous sync requests do not move the cursor backward or skip books', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  let bookIds = [];
  await seboRef.set(criarPerfil({
    geocode: pontoNovo,
    localizacaoVersao: 20,
    localizacaoSyncStatus: 'pendente'
  }));
  try {
    bookIds = await criarLivros(seboId, 6, { versao: 19 });
    const sincronizar = criarSincronizador({
      batchSize: 2,
      maxBatchesPerRequest: 1
    });
    const resultadosConcorrentes = await Promise.all([
      sincronizar(seboId),
      sincronizar(seboId)
    ]);

    assert.ok(
      resultadosConcorrentes.every(resultado =>
        ['pendente', 'sincronizado'].includes(resultado.status)
      ),
      `Unexpected concurrent sync results: ${JSON.stringify(resultadosConcorrentes)}`
    );
    const perfilConcorrente = (await obterSebo(seboId)).data();
    const posicaoCursor = bookIds.indexOf(perfilConcorrente.localizacaoSyncCursor);
    assert.ok(posicaoCursor >= 3, 'as duas requisições devem avançar ao menos dois lotes');
    assert.equal(perfilConcorrente.localizacaoVersao, 20);

    for (const id of bookIds.slice(0, posicaoCursor + 1)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 20);
      assert.deepEqual(livro.geocode, pontoNovo);
    }

    for (let chamada = 0; chamada < 5; chamada += 1) {
      const resultado = await sincronizar(seboId);
      if (resultado.status === 'sincronizado') break;
    }
    assert.equal((await obterSebo(seboId)).data().localizacaoSyncStatus, 'sincronizado');
    for (const id of bookIds) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 20);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
  } finally {
    await limparFixture(seboId, bookIds);
  }
});

test('XLSX shared creation flow uses pending profile location and retries on a version race', async () => {
  const seboId = criarSeboId();
  const seboRef = db.collection('sebos').doc(seboId);
  const geocodeAntigoPronto = aguardarSinal();
  const liberarGeocodeAntigo = aguardarSinal();
  const persistenciaIniciada = aguardarSinal();
  const liberarPersistencia = aguardarSinal();
  const createdIds = [];
  await seboRef.set(criarPerfil({
    localizacaoVersao: 10,
    localizacaoSyncStatus: 'sincronizado'
  }));
  const geocodificarEndereco = async endereco => {
    if (endereco.rua === 'Endereço de importação pendente') {
      geocodeAntigoPronto.sinalizar();
      await liberarGeocodeAntigo.promise;
      return { geocode: pontoNovo, aviso: null };
    }
    return { geocode: pontoMaisNovo, aviso: null };
  };
  const sincronizar = criarSincronizador({ geocodificarEndereco });
  const atualizarSebo = criarAtualizador(sincronizar);

  try {
    const atualizacaoPendente = atualizarSebo(seboId, {
      endereco: { ...enderecoNovo, rua: 'Endereço de importação pendente' }
    });
    await geocodeAntigoPronto.promise;

    const { criarCriadorLivroSebo, criarLivroImportadoSebo, persistirLivro } =
      await carregarServicoCriacao();
    const dadosLivro = sufixo => ({
      titulo: `Livro importado ${sufixo}`,
      autor: 'Autoria de teste',
      tipo: 'venda',
      preco: 25,
      localizacao: 'Estante de teste',
      quantidadeEstoque: 2
    });
    const livroImportadoPendente = await criarLivroImportadoSebo({
      seboId,
      dados: dadosLivro('pendente')
    });
    createdIds.push(livroImportadoPendente.id);
    let persistido = (await obterLivro(livroImportadoPendente.id)).data();
    assert.equal(persistido.localizacaoVersaoPerfil, 11);
    assert.equal(Object.hasOwn(persistido, 'geocode'), false);

    liberarGeocodeAntigo.sinalizar();
    await atualizacaoPendente;
    persistido = (await obterLivro(livroImportadoPendente.id)).data();
    assert.equal(persistido.localizacaoVersaoPerfil, 11);
    assert.deepEqual(persistido.geocode, pontoNovo);

    let chamadasPersistencia = 0;
    const criarComVersaoConcorrente = criarCriadorLivroSebo({
      persistir: async argumentos => {
        chamadasPersistencia += 1;
        if (chamadasPersistencia === 1) {
          persistenciaIniciada.sinalizar();
          await liberarPersistencia.promise;
        }
        return persistirLivro(argumentos);
      }
    });
    const criacaoConcorrente = criarComVersaoConcorrente({
      seboId,
      dados: dadosLivro('versao-concorrente')
    });
    await persistenciaIniciada.promise;

    const atualizacaoMaisNova = await atualizarSebo(seboId, {
      endereco: { ...enderecoNovo, rua: 'Endereço mais recente', cep: '04000-000' }
    });
    assert.equal(atualizacaoMaisNova.localizacaoVersao, 12);
    assert.deepEqual(atualizacaoMaisNova.geocode, pontoMaisNovo);

    liberarPersistencia.sinalizar();
    const livroRefeito = await criacaoConcorrente;
    createdIds.push(livroRefeito.id);
    assert.equal(chamadasPersistencia, 2);
    persistido = (await obterLivro(livroRefeito.id)).data();
    assert.equal(persistido.localizacaoVersaoPerfil, 12);
    assert.deepEqual(persistido.geocode, pontoMaisNovo);
    assert.equal(persistido.geocode.coordinates[0], -46.65);
  } finally {
    liberarGeocodeAntigo.sinalizar();
    liberarPersistencia.sinalizar();
    await limparLivrosCriadosPeloServico(createdIds);
    await limparFixture(seboId);
  }
});

test('syncing one sebo leaves another sebo and regular-user books unchanged', async () => {
  const seboAId = criarSeboId();
  const seboBId = criarSeboId();
  const seboARef = db.collection('sebos').doc(seboAId);
  const seboBRef = db.collection('sebos').doc(seboBId);
  let livrosA = [];
  const livroSeboBId = `${seboBId}-book-untouched`;
  const livroUsuarioId = `${seboAId}-regular-user`;

  await Promise.all([
    seboARef.set(criarPerfil({
      geocode: pontoNovo,
      localizacaoVersao: 30,
      localizacaoSyncStatus: 'pendente'
    })),
    seboBRef.set(criarPerfil({
      geocode: pontoAntigo,
      localizacaoVersao: 9,
      localizacaoSyncStatus: 'sincronizado'
    }))
  ]);
  try {
    livrosA = await criarLivros(seboAId, 3, { versao: 29 });
    await db.collection('livros').doc(livroSeboBId).set({
      seboId: seboBId,
      titulo: 'Livro do outro sebo',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 9
    });
    await db.collection('livros').doc(livroUsuarioId).set({
      usuarioId: 'usuario-comum-de-teste',
      titulo: 'Livro de usuário comum',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 9
    });

    const sincronizar = criarSincronizador({ maxBatchesPerRequest: 1, batchSize: 2 });
    await sincronizar(seboAId);

    const livroOutroSebo = (await obterLivro(livroSeboBId)).data();
    const livroUsuario = (await obterLivro(livroUsuarioId)).data();
    assert.equal(livroOutroSebo.localizacaoVersaoPerfil, 9);
    assert.deepEqual(livroOutroSebo.geocode, pontoAntigo);
    assert.equal(livroUsuario.localizacaoVersaoPerfil, 9);
    assert.deepEqual(livroUsuario.geocode, pontoAntigo);
    for (const id of livrosA.slice(0, 2)) {
      const livro = (await obterLivro(id)).data();
      assert.equal(livro.localizacaoVersaoPerfil, 30);
      assert.deepEqual(livro.geocode, pontoNovo);
    }
    assert.equal((await obterLivro(livrosA[2])).data().localizacaoVersaoPerfil, 29);
  } finally {
    await Promise.all([
      limparFixture(seboAId, [...livrosA, livroUsuarioId]),
      limparFixture(seboBId, [livroSeboBId])
    ]);
  }
});

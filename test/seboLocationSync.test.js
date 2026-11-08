import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSincronizadorLocalizacaoSebo } from '../src/services/seboLocationSyncService.js';
import { criarAtualizadorSebo } from '../src/services/seboProfileService.js';
import { criarCriadorLivroSebo } from '../src/services/livroCreationService.js';
import { filtrarLivrosProximos } from '../src/utils/geoDistance.js';
import { exigirGestorSebo } from '../src/middlewares/authMiddleware.js';

const DELETE = Symbol('delete');
const pontoAntigo = { type: 'Point', coordinates: [-46.63, -23.55] };
const pontoNovo = { type: 'Point', coordinates: [-46.64, -23.56] };
const enderecoInicial = {
  rua: 'Rua A',
  numero: '10',
  complemento: '',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01000-000'
};
const enderecoNovo = { ...enderecoInicial, rua: 'Rua B', cep: '02000-000' };
const horario = {
  segunda: { abre: '08:00', fecha: '18:00' },
  terca: { abre: '08:00', fecha: '18:00' },
  quarta: { abre: '08:00', fecha: '18:00' },
  quinta: { abre: '08:00', fecha: '18:00' },
  sexta: { abre: '08:00', fecha: '18:00' },
  sabado: null,
  domingo: null
};

class FakeSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this._data = data;
  }

  data() {
    return this._data;
  }
}

class FakeDocumentReference {
  constructor(db, collection, id) {
    this.db = db;
    this.collectionName = collection;
    this.id = id;
  }

  async get() {
    return new FakeSnapshot(this, this.db.data[this.collectionName].get(this.id));
  }
}

class FakeQuery {
  constructor(db, collection, filters = [], cursor = null, max = Infinity) {
    this.db = db;
    this.collectionName = collection;
    this.filters = filters;
    this.cursor = cursor;
    this.max = max;
  }

  where(field, operator, value) {
    assert.equal(operator, '==');
    return new FakeQuery(this.db, this.collectionName, [...this.filters, [field, value]], this.cursor, this.max);
  }

  orderBy() {
    return this;
  }

  limit(max) {
    return new FakeQuery(this.db, this.collectionName, this.filters, this.cursor, max);
  }

  startAfter(ref) {
    return new FakeQuery(this.db, this.collectionName, this.filters, ref.id, this.max);
  }

  snapshot() {
    let rows = [...this.db.data[this.collectionName].entries()]
      .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
      .sort(([idA], [idB]) => idA.localeCompare(idB));
    if (this.cursor) rows = rows.filter(([id]) => id > this.cursor);
    rows = rows.slice(0, this.max);
    const docs = rows.map(([id, data]) => ({
      id,
      ref: new FakeDocumentReference(this.db, this.collectionName, id),
      data: () => data
    }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    return new FakeDocumentReference(this.db, this.name, id);
  }

  where(field, operator, value) {
    return new FakeQuery(this.db, this.name).where(field, operator, value);
  }
}

class FakeFirestore {
  constructor() {
    this.data = { sebos: new Map(), livros: new Map(), sebos_cnpj: new Map() };
    this.collection = name => new FakeCollection(this, name);
    this.bookBatches = 0;
    this.failBookBatchAt = 0;
    this.failedBatch = false;
    this.transactionTail = Promise.resolve();
  }

  seed(collection, id, data) {
    this.data[collection].set(id, structuredClone(data));
  }

  async runTransaction(callback) {
    const previousTransaction = this.transactionTail;
    let releaseTransaction;
    this.transactionTail = new Promise(resolve => {
      releaseTransaction = resolve;
    });
    await previousTransaction;

    const updates = [];
    const transaction = {
      get: async value => value instanceof FakeQuery
        ? value.snapshot()
        : value.get(),
      update: (ref, fields) => updates.push([ref, fields])
    };
    try {
      const result = await callback(transaction);
      const hasBookUpdates = updates.some(([ref]) => ref.collectionName === 'livros');
      if (hasBookUpdates) {
        this.bookBatches += 1;
        if (this.bookBatches === this.failBookBatchAt && !this.failedBatch) {
          this.failedBatch = true;
          throw new Error('injected batch failure');
        }
      }
      for (const [ref, fields] of updates) {
        const current = this.data[ref.collectionName].get(ref.id);
        if (!current) throw new Error(`Missing document ${ref.collectionName}/${ref.id}`);
        for (const [field, value] of Object.entries(fields)) {
          if (value === DELETE) delete current[field];
          else current[field] = structuredClone(value);
        }
      }
      return result;
    } finally {
      releaseTransaction();
    }
  }
}

const criarSebo = (overrides = {}) => ({
  nome: 'Sebo A',
  email: 'sebo@email.com',
  cnpj: '20.182.807/0004-42',
  telefone: ['(11) 99999-9999'],
  endereco: enderecoInicial,
  horario_funcionamento: horario,
  geocode: pontoAntigo,
  localizacaoVersao: 0,
  localizacaoSyncStatus: 'sincronizado',
  ...overrides
});

const criarSync = (
  db,
  geocodificarEndereco = async () => ({ geocode: pontoNovo, aviso: null }),
  batchSize = 2,
  maxBatchesPerRequest = 2
) =>
  criarSincronizadorLocalizacaoSebo({
    db,
    deleteField: () => DELETE,
    documentIdFieldPath: '__name__',
    geocodificarEndereco,
    batchSize,
    maxBatchesPerRequest,
    logger: { error() {} }
  });

test('address edits increment location version and synchronize, while profile-only edits do not', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo());
  let syncCalls = 0;
  const update = criarAtualizadorSebo({
    db,
    deleteField: () => DELETE,
    now: () => new Date('2026-01-01T00:00:00Z'),
    sincronizarLocalizacao: async () => {
      syncCalls += 1;
      return { status: 'sincronizado' };
    }
  });

  const nonLocationUpdate = await update('sebo-1', {
    nome: 'Sebo Novo',
    telefone: ['(11) 99999-1111'],
    horario_funcionamento: horario
  });
  assert.equal(syncCalls, 0);
  assert.equal(nonLocationUpdate.localizacaoVersao, 0);
  assert.deepEqual(nonLocationUpdate.endereco, enderecoInicial);
  assert.deepEqual(nonLocationUpdate.telefone, ['(11) 99999-1111']);

  const addressUpdate = await update('sebo-1', { endereco: enderecoNovo });
  assert.equal(syncCalls, 1);
  assert.equal(addressUpdate.localizacaoVersao, 1);
  assert.equal(addressUpdate.localizacaoSyncStatus, 'pendente');
  assert.equal(addressUpdate.geocode, undefined);
  assert.deepEqual(addressUpdate.endereco, enderecoNovo);
});

test('rejects attempts to edit CNPJ and internal identity fields', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo());
  const update = criarAtualizadorSebo({
    db,
    deleteField: () => DELETE,
    sincronizarLocalizacao: async () => ({ status: 'sincronizado' })
  });

  await assert.rejects(update('sebo-1', { cnpj: '12.345.678/0001-90' }), {
    status: 400
  });
  await assert.rejects(update('sebo-1', { uid: 'other-user' }), { status: 400 });
});

test('allows a manager and blocks staff accounts from manager-only operations', () => {
  const response = {
    code: null,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;
  exigirGestorSebo({ subconta: null }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  exigirGestorSebo({ subconta: { seboId: 'sebo-1' } }, response, () => { nextCalled = true; });
  assert.equal(response.code, 403);
  assert.equal(response.body.erro, 'Somente o gestor do sebo pode gerenciar subcontas');
});

test('syncs all books belonging to one sebo in safe batches without changing other owners', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: pontoNovo,
    localizacaoVersao: 3,
    localizacaoSyncStatus: 'pendente'
  }));
  for (const id of ['book-a', 'book-b', 'book-c']) {
    db.seed('livros', id, {
      seboId: 'sebo-1',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 2
    });
  }
  db.seed('livros', 'other-sebo', { seboId: 'sebo-2', geocode: pontoAntigo });
  db.seed('livros', 'regular-user', { usuarioId: 'user-1', geocode: pontoAntigo });

  const sync = criarSync(db);
  const firstRequest = await sync('sebo-1');
  assert.equal(firstRequest.status, 'pendente');
  assert.equal(firstRequest.continuar, true);
  assert.equal(firstRequest.anunciosAtualizados, 3);
  const result = await sync('sebo-1');
  assert.equal(result.status, 'sincronizado');
  assert.equal(result.anunciosAtualizados, 0);
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncStatus, 'sincronizado');
  for (const id of ['book-a', 'book-b', 'book-c']) {
    assert.deepEqual(db.data.livros.get(id).geocode, pontoNovo);
    assert.equal(db.data.livros.get(id).localizacaoVersaoPerfil, 3);
  }
  assert.deepEqual(db.data.livros.get('other-sebo').geocode, pontoAntigo);
  assert.deepEqual(db.data.livros.get('regular-user').geocode, pontoAntigo);
});

test('keeps stale ads out of proximity results after geocoding failure', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: undefined,
    localizacaoVersao: 1,
    localizacaoSyncStatus: 'pendente'
  }));
  db.seed('livros', 'old-ad', {
    seboId: 'sebo-1',
    usuarioId: 'sebo-1',
    tipo: 'venda',
    status: 'disponivel',
    quantidadeEstoque: 1,
    geocode: pontoAntigo,
    localizacaoVersaoPerfil: 0
  });
  const sync = criarSync(db, async () => ({
    geocode: null,
    aviso: 'Endereço não confirmado'
  }));

  const result = await sync('sebo-1');
  assert.equal(result.status, 'erro');
  assert.equal(db.data.sebos.get('sebo-1').geocode, undefined);
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncStatus, 'erro');
  const proximity = filtrarLivrosProximos({
    livros: [{ id: 'old-ad', ...db.data.livros.get('old-ad') }],
    origem: { latitude: -23.55, longitude: -46.63 },
    raioKm: 3,
    sebosPorId: new Map([['sebo-1', db.data.sebos.get('sebo-1')]])
  });
  assert.equal(proximity.total, 0);
});

test('resumes a partially failed batch sequence from its saved cursor', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: pontoNovo,
    localizacaoVersao: 3,
    localizacaoSyncStatus: 'pendente'
  }));
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d', 'book-e']) {
    db.seed('livros', id, {
      seboId: 'sebo-1',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 2
    });
  }
  db.failBookBatchAt = 2;
  const sync = criarSync(db);

  const failed = await sync('sebo-1');
  assert.equal(failed.status, 'erro');
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncCursor, 'book-b');
  assert.equal(db.data.livros.get('book-a').localizacaoVersaoPerfil, 3);

  const resumedFirstRequest = await sync('sebo-1');
  assert.equal(resumedFirstRequest.status, 'pendente');
  const resumed = await sync('sebo-1');
  assert.equal(resumed.status, 'sincronizado');
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncStatus, 'sincronizado');
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d', 'book-e']) {
    assert.equal(db.data.livros.get(id).localizacaoVersaoPerfil, 3);
    assert.deepEqual(db.data.livros.get(id).geocode, pontoNovo);
  }
});

test('limits each request and resumes the remaining books on later requests', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: pontoNovo,
    localizacaoVersao: 3,
    localizacaoSyncStatus: 'pendente'
  }));
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d', 'book-e']) {
    db.seed('livros', id, {
      seboId: 'sebo-1',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 2
    });
  }
  const sync = criarSync(db, undefined, 2, 1);
  const requestResults = [];

  for (let request = 0; request < 5; request += 1) {
    const result = await sync('sebo-1');
    requestResults.push(result);
    if (result.status === 'sincronizado') break;
    assert.equal(result.status, 'pendente');
    assert.equal(result.continuar, true);
  }

  assert.equal(requestResults.length, 4);
  assert.deepEqual(requestResults.slice(0, 3).map(result => result.anunciosAtualizados), [2, 2, 1]);
  assert.equal(requestResults[3].status, 'sincronizado');
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d', 'book-e']) {
    assert.equal(db.data.livros.get(id).localizacaoVersaoPerfil, 3);
    assert.deepEqual(db.data.livros.get(id).geocode, pontoNovo);
  }
});

test('concurrent requests advance the saved cursor without skipping or reverting pages', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: pontoNovo,
    localizacaoVersao: 3,
    localizacaoSyncStatus: 'pendente'
  }));
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d', 'book-e']) {
    db.seed('livros', id, {
      seboId: 'sebo-1',
      geocode: pontoAntigo,
      localizacaoVersaoPerfil: 2
    });
  }
  const sync = criarSync(db, undefined, 2, 1);

  const concurrentResults = await Promise.all([sync('sebo-1'), sync('sebo-1')]);
  assert.ok(concurrentResults.every(result => result.status === 'pendente'));
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncCursor, 'book-d');
  for (const id of ['book-a', 'book-b', 'book-c', 'book-d']) {
    assert.equal(db.data.livros.get(id).localizacaoVersaoPerfil, 3);
  }
  assert.equal(db.data.livros.get('book-e').localizacaoVersaoPerfil, 2);

  const resumed = await sync('sebo-1');
  assert.equal(resumed.status, 'pendente');
  assert.equal(db.data.sebos.get('sebo-1').localizacaoSyncCursor, 'book-e');
  assert.equal(db.data.livros.get('book-e').localizacaoVersaoPerfil, 3);
  assert.equal((await sync('sebo-1')).status, 'sincronizado');
});

test('does not apply an old geocoding result after a newer address version wins', async () => {
  const db = new FakeFirestore();
  db.seed('sebos', 'sebo-1', criarSebo({
    geocode: undefined,
    localizacaoVersao: 4,
    localizacaoSyncStatus: 'pendente'
  }));
  let releaseGeocode;
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const sync = criarSync(db, () => {
    started();
    return new Promise(resolve => { releaseGeocode = resolve; });
  });
  const running = sync('sebo-1');
  await startedPromise;

  db.data.sebos.set('sebo-1', {
    ...db.data.sebos.get('sebo-1'),
    endereco: enderecoNovo,
    localizacaoVersao: 5,
    localizacaoSyncStatus: 'pendente',
    geocode: undefined
  });
  releaseGeocode({ geocode: pontoAntigo, aviso: null });
  const result = await running;

  assert.equal(result.supersedido, true);
  assert.equal(db.data.sebos.get('sebo-1').localizacaoVersao, 5);
  assert.equal(db.data.sebos.get('sebo-1').geocode, undefined);
});

test('book creation retries with the current sebo location version and accepts missing geocode', async () => {
  let reads = 0;
  const versions = [
    { nome: 'Sebo A', localizacaoVersao: 2, geocode: pontoAntigo },
    {
      nome: 'Sebo A',
      localizacaoVersao: 3,
      geocode: undefined,
      localizacaoSyncStatus: 'pendente'
    }
  ];
  const persisted = [];
  let persistCalls = 0;
  const createBook = criarCriadorLivroSebo({
    buscarSebo: async () => versions[Math.min(reads++, versions.length - 1)],
    persistir: async args => {
      persistCalls += 1;
      if (persistCalls === 1) {
        const error = new Error('version changed');
        error.code = 'sebo/location-version-changed';
        throw error;
      }
      persisted.push(args);
      return { id: 'new-book', ...args };
    }
  });

  const livro = await createBook({
    seboId: 'sebo-1',
    dados: {
      titulo: 'Livro teste',
      autor: 'Autoria',
      tipo: 'venda',
      preco: 10,
      localizacao: 'Estante A',
      quantidadeEstoque: 1
    }
  });
  assert.equal(livro.id, 'new-book');
  assert.equal(persisted[0].localizacaoVersaoPerfil, 3);
  assert.equal(persisted[0].geocodeSebo, undefined);
});

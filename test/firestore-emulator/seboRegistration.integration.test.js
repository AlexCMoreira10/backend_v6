import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { db, FieldPath, FieldValue } from './admin.js';
import { criarGeocodificadorSimulado } from './geocodingMock.js';
import { criarCadastradorSebo } from '../../src/services/seboRegistrationService.js';
import { criarSincronizadorLocalizacaoSebo } from '../../src/services/seboLocationSyncService.js';
import { criarCriadorLivroSebo } from '../../src/services/seboBookCreationService.js';
import { validarCadastroSebo } from '../../src/utils/seboValidation.js';

const endereco = {
  rua: 'Rua Comercial de Teste',
  numero: '123',
  complemento: 'Loja 2',
  bairro: 'Centro',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01000-000'
};
const geocodeOficial = { type: 'Point', coordinates: [-46.63, -23.55] };
const geocodeCliente = { type: 'Point', coordinates: [12.5, 48.1] };
const horario = {
  segunda: { abre: '08:00', fecha: '18:00' },
  terca: { abre: '08:00', fecha: '18:00' },
  quarta: { abre: '08:00', fecha: '18:00' },
  quinta: { abre: '08:00', fecha: '18:00' },
  sexta: { abre: '08:00', fecha: '18:00' },
  sabado: null,
  domingo: null
};
const cnpj = '20.182.807/0004-42';
const gerarUid = () => `registration-${randomUUID()}`;
const buscarSebo = async uid => {
  const snapshot = await db.collection('sebos').doc(uid).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
};
const limparPerfil = async (uid, cnpjId = cnpj.replace(/[./\-\s]/g, '')) => {
  await Promise.all([
    db.collection('sebos').doc(uid).delete(),
    db.collection('sebos_cnpj').doc(cnpjId).delete()
  ]);
};
const dadosCadastro = uid => ({
  nome: 'Sebo Comercial de Teste',
  email: `${uid}@example.invalid`,
  cnpj,
  telefone: ['(11) 99999-9999'],
  endereco,
  horario_funcionamento: horario
});

test('cadastro ignora coordenadas do cliente e salva as geocodificadas pelo endereço comercial', async () => {
  const uid = gerarUid();
  let enderecoGeocodificado;
  const cadastrar = criarCadastradorSebo({
    db,
    geocodificarEndereco: async enderecoRecebido => {
      enderecoGeocodificado = enderecoRecebido;
      return { geocode: geocodeOficial, aviso: null };
    }
  });

  try {
    const validacao = validarCadastroSebo({
      ...dadosCadastro(uid),
      geocode: geocodeCliente
    }, `${uid}@example.invalid`);
    assert.equal(validacao.erro, undefined);
    assert.equal(Object.hasOwn(validacao.sebo, 'geocode'), false);

    await cadastrar(uid, {
      ...validacao.sebo,
      geocode: geocodeCliente
    });

    const salvo = await buscarSebo(uid);
    assert.deepEqual(enderecoGeocodificado, validacao.sebo.endereco);
    assert.deepEqual(salvo.geocode, geocodeOficial);
    assert.notDeepEqual(salvo.geocode, geocodeCliente);
    assert.equal(salvo.localizacaoVersao, 1);
    assert.equal(salvo.localizacaoSyncStatus, 'sincronizado');
  } finally {
    await limparPerfil(uid);
  }
});

test('falha de geocodificação não salva perfil nem vínculo de CNPJ', async () => {
  const uid = gerarUid();
  const cadastrar = criarCadastradorSebo({
    db,
    geocodificarEndereco: criarGeocodificadorSimulado({
      geocode: null,
      aviso: 'Endereço não confirmado'
    })
  });

  try {
    await assert.rejects(
      cadastrar(uid, dadosCadastro(uid)),
      error => error.status === 422 && /Endereço não confirmado/.test(error.message)
    );
    assert.equal((await db.collection('sebos').doc(uid).get()).exists, false);
    assert.equal(
      (await db.collection('sebos_cnpj').doc(cnpj.replace(/[./\-\s]/g, '')).get()).exists,
      false
    );
  } finally {
    await limparPerfil(uid);
  }
});

test('erro de conexão com geocodificador não salva perfil nem vínculo de CNPJ', async () => {
  const uid = gerarUid();
  const cadastrar = criarCadastradorSebo({
    db,
    geocodificarEndereco: async () => {
      throw new Error('simulated geocoding outage');
    },
    logger: { error() {} }
  });

  try {
    await assert.rejects(
      cadastrar(uid, dadosCadastro(uid)),
      error => error.status === 502 && /geocodificação está indisponível/.test(error.message)
    );
    assert.equal((await db.collection('sebos').doc(uid).get()).exists, false);
    assert.equal(
      (await db.collection('sebos_cnpj').doc(cnpj.replace(/[./\-\s]/g, '')).get()).exists,
      false
    );
  } finally {
    await limparPerfil(uid);
  }
});

test('cadastro de livro prepara a localização de perfil legado e repassa o geocode oficial', async () => {
  const uid = gerarUid();
  const perfilRef = db.collection('sebos').doc(uid);
  await perfilRef.set({
    uid,
    nome: 'Sebo legado de teste',
    endereco,
    localizacaoVersao: 2,
    localizacaoSyncStatus: 'erro'
  });

  const sincronizar = criarSincronizadorLocalizacaoSebo({
    db,
    deleteField: () => FieldValue.delete(),
    documentIdFieldPath: FieldPath.documentId(),
    geocodificarEndereco: criarGeocodificadorSimulado({ geocode: geocodeOficial }),
    logger: { error() {} }
  });
  let dadosPersistidos;
  const criarLivro = criarCriadorLivroSebo({
    buscarSebo,
    prepararLocalizacao: async seboId => {
      await sincronizar(seboId);
      return buscarSebo(seboId);
    },
    persistir: async dados => {
      dadosPersistidos = dados;
      return { id: 'livro-ficticio' };
    },
    validarDadosNovoLivro: () => null
  });

  try {
    await criarLivro({
      seboId: uid,
      dados: { titulo: 'Livro de teste', autor: 'Autoria fictícia' }
    });

    assert.deepEqual(dadosPersistidos.geocodeSebo, geocodeOficial);
    assert.equal(dadosPersistidos.localizacaoVersaoPerfil, 2);
    const atualizado = await buscarSebo(uid);
    assert.deepEqual(atualizado.geocode, geocodeOficial);
    assert.equal(atualizado.localizacaoSyncStatus, 'sincronizado');
  } finally {
    await perfilRef.delete();
  }
});

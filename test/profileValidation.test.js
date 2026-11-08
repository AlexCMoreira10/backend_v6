import test from 'node:test';
import assert from 'node:assert/strict';
import { validarAtualizacaoPerfil } from '../src/utils/profileValidation.js';

const dadosValidos = () => ({
  nome: 'Ana Leitora',
  telefone: ['(11) 99999-9999'],
  data_nascimento: '1995-08-21',
  endereco: {
    rua: 'Rua dos Livros',
    numero: '',
    complemento: '',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01000-000'
  },
  geocode: { type: 'Point', coordinates: [-46.63, -23.55] }
});

test('validates and normalizes personal profile data', () => {
  const resultado = validarAtualizacaoPerfil(dadosValidos());

  assert.equal(resultado.erro, undefined);
  assert.equal(resultado.atualizacao.nome, 'Ana Leitora');
  assert.deepEqual(resultado.atualizacao.telefone, ['(11) 99999-9999']);
  assert.ok(resultado.atualizacao.data_nascimento instanceof Date);
});

test('rejects attempts to change immutable or unknown account fields', () => {
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), email: 'novo@email.com' }).erro, /não podem ser alterados/);
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), uid: 'outro-uid' }).erro, /não podem ser alterados/);
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), foto: 'url' }).erro, /não pode ser atualizado/);
});

test('rejects invalid personal data and coordinates', () => {
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), nome: ' ' }).erro, /nome completo/);
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), telefone: [] }).erro, /telefone/);
  assert.match(validarAtualizacaoPerfil({ ...dadosValidos(), data_nascimento: '2024-02-31' }).erro, /data de nascimento/);
  assert.match(
    validarAtualizacaoPerfil({
      ...dadosValidos(),
      geocode: { type: 'Point', coordinates: [-181, 0] }
    }).erro,
    /localização/
  );
});

test('allows clearing the optional location and preserves optional address fields', () => {
  const resultado = validarAtualizacaoPerfil({
    ...dadosValidos(),
    endereco: { rua: '' },
    geocode: null
  });

  assert.equal(resultado.erro, undefined);
  assert.deepEqual(resultado.atualizacao.endereco, { rua: '' });
  assert.equal(resultado.atualizacao.geocode, null);
});

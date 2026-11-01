import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPEIS_SUBCONTA,
  formatarCpf,
  validarAtualizacaoSubconta,
  validarCpf,
  validarDadosSubconta
} from '../src/utils/subcontaValidation.js';

const dadosValidos = () => ({
  nome: 'Ana Colaboradora',
  login: 'ana.livros',
  telefone: '(11) 99999-9999',
  cpf: '529.982.247-25',
  tipo: 'cadastrador_acervo',
  permissoes: [...PAPEIS_SUBCONTA.cadastrador_acervo],
  senhaTemporaria: 'SenhaTemporaria123'
});

test('validates and formats CPF', () => {
  assert.equal(validarCpf('529.982.247-25'), true);
  assert.equal(formatarCpf('52998224725'), '529.982.247-25');
  assert.equal(validarCpf('529.982.247-24'), false);
  assert.equal(validarCpf('111.111.111-11'), false);
});

test('accepts a collaborator account with an optional phone and preset permissions', () => {
  const dados = dadosValidos();
  const resultado = validarDadosSubconta(dados);
  assert.equal(resultado.erro, undefined);
  assert.equal(resultado.subconta.login, 'ana.livros');
  assert.deepEqual(resultado.subconta.permissoes, PAPEIS_SUBCONTA.cadastrador_acervo);

  const semTelefone = validarDadosSubconta({ ...dados, telefone: '' });
  assert.equal(semTelefone.subconta.telefone, null);
});

test('rejects invalid CPF, login, phone and permission values', () => {
  assert.match(validarDadosSubconta({ ...dadosValidos(), cpf: '123' }).erro, /CPF válido/);
  assert.match(validarDadosSubconta({ ...dadosValidos(), login: 'ana@sebo.com' }).erro, /login deve/);
  assert.match(validarDadosSubconta({ ...dadosValidos(), telefone: '1234' }).erro, /telefone deve/);
  assert.match(
    validarDadosSubconta({ ...dadosValidos(), permissoes: ['admin.total'] }).erro,
    /permissões contém/
  );
});

test('allows selected permissions to differ from the preset and validates updates', () => {
  const personalizado = validarDadosSubconta({
    ...dadosValidos(),
    permissoes: ['acervo.consultar', 'financeiro.consultar']
  });
  assert.equal(personalizado.erro, undefined);

  const update = validarAtualizacaoSubconta({
    tipo: 'personalizado',
    permissoes: ['acervo.consultar'],
    ativo: false
  });
  assert.equal(update.erro, undefined);
  assert.equal(update.atualizacao.ativo, false);
});

test('allows message access for standard collaborator roles and custom assignments', () => {
  for (const tipo of ['cadastrador_acervo', 'operador_negociacoes', 'gestor_financeiro']) {
    assert.ok(PAPEIS_SUBCONTA[tipo].includes('mensagens.gerenciar'));
  }

  const personalizado = validarDadosSubconta({
    ...dadosValidos(),
    tipo: 'personalizado',
    permissoes: ['mensagens.gerenciar']
  });
  assert.equal(personalizado.erro, undefined);
  assert.deepEqual(personalizado.subconta.permissoes, ['mensagens.gerenciar']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mensagemVisivelPara,
  usuarioParticipaDaMensagem,
  resultadoAoApagarMensagem
} from '../src/utils/mensagemVisibility.js';

test('messages without a hidden-user list remain visible', () => {
  assert.equal(mensagemVisivelPara({ conteudo: 'Olá' }, 'usuario-a'), true);
});

test('a hidden message disappears only for the user who hid it', () => {
  const mensagem = { ocultada_para: ['usuario-a'] };

  assert.equal(mensagemVisivelPara(mensagem, 'usuario-a'), false);
  assert.equal(mensagemVisivelPara(mensagem, 'usuario-b'), true);
});

test('either participant may hide a message, but unrelated users may not', () => {
  const mensagem = {
    id_remetente: 'remetente',
    id_destinatario: 'destinatario'
  };

  assert.equal(usuarioParticipaDaMensagem(mensagem, 'remetente'), true);
  assert.equal(usuarioParticipaDaMensagem(mensagem, 'destinatario'), true);
  assert.equal(usuarioParticipaDaMensagem(mensagem, 'terceiro'), false);
});

test('deleting a sent message removes it for everyone; deleting a received one hides it locally', () => {
  const mensagem = {
    id_remetente: 'remetente',
    id_destinatario: 'destinatario'
  };

  assert.equal(resultadoAoApagarMensagem(mensagem, 'remetente'), 'apagada_para_todos');
  assert.equal(resultadoAoApagarMensagem(mensagem, 'destinatario'), 'ocultada_para_mim');
  assert.equal(resultadoAoApagarMensagem(mensagem, 'terceiro'), 'sem_permissao');
});

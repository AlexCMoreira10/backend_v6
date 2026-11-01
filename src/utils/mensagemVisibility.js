export const mensagemVisivelPara = (mensagem, idUsuario) =>
  !(mensagem.ocultada_para || []).includes(idUsuario);

export const usuarioParticipaDaMensagem = (mensagem, idUsuario) =>
  mensagem.id_remetente === idUsuario || mensagem.id_destinatario === idUsuario;

export const resultadoAoApagarMensagem = (mensagem, idUsuario) => {
  if (mensagem.id_remetente === idUsuario) return 'apagada_para_todos';
  if (mensagem.id_destinatario === idUsuario) return 'ocultada_para_mim';
  return 'sem_permissao';
};

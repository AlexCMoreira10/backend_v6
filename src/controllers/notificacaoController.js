import {
  listarNotificacoes,
  marcarComoLida
} from '../services/notificacaoService.js';

export const listarNotificacoesController = async (req, res) => {
  try {
    const usuarioId = req.usuario.uid;

    const notificacoes = await listarNotificacoes(usuarioId);

    return res.json(notificacoes);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar notificações'
    });
  }
};

export const marcarNotificacaoComoLidaController = async (req, res) => {
  try {
    const { id } = req.params;

    await marcarComoLida(id);

    return res.json({ mensagem: 'Notificação marcada como lida' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao atualizar notificação'
    });
  }
};

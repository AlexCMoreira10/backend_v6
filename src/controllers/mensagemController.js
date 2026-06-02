import { buscarUsuarioPorId } from '../services/userService.js';
import { criarMensagem } from '../services/mensagemService.js';

export const enviarMensagemController = async (req, res) => {
  try {
    const id_remetente = req.usuario.uid;
    const { id_destinatario, conteudo } = req.body;

    if (!id_destinatario) {
      return res.status(400).json({ erro: 'ID do destinatário é obrigatório' });
    }

    if (!conteudo || !conteudo.trim()) {
      return res.status(400).json({ erro: 'Conteúdo da mensagem não pode ser vazio' });
    }

    const remetente = await buscarUsuarioPorId(id_remetente);
    if (!remetente) {
      return res.status(404).json({ erro: 'Remetente não encontrado' });
    }

    const destinatario = await buscarUsuarioPorId(id_destinatario);
    if (!destinatario) {
      return res.status(404).json({ erro: 'Destinatário não encontrado' });
    }

    const mensagem = {
      id_remetente,
      id_destinatario,
      conteudo: conteudo.trim(),
      data_envio: new Date(),
      lida: false
    };

    const resultado = await criarMensagem(mensagem);

    return res.status(201).json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao enviar mensagem' });
  }
};

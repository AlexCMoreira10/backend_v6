import { buscarUsuarioPorId } from '../services/userService.js';
import {
  criarMensagem,
  listarMensagensDoUsuario,
  listarConversasDoUsuario,
  listarMensagensDaConversa,
  marcarMensagemComoLida
} from '../services/mensagemService.js';

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 100;

const validarPaginacao = (query) => {
  const pagina = query.page === undefined ? 1 : Number(query.page);
  const limite = query.limit === undefined
    ? LIMITE_PADRAO
    : Number(query.limit);

  if (
    !Number.isSafeInteger(pagina) ||
    pagina < 1 ||
    !Number.isSafeInteger(limite) ||
    limite < 1 ||
    limite > LIMITE_MAXIMO
  ) {
    return null;
  }

  return { pagina, limite };
};

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

export const listarMensagensController = async (req, res) => {
  try {
    const mensagens = await listarMensagensDoUsuario(req.usuario.uid);
    return res.json(mensagens);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao listar mensagens' });
  }
};

export const listarConversasController = async (req, res) => {
  try {
    const conversas = await listarConversasDoUsuario(req.usuario.uid);
    return res.json(conversas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao listar conversas' });
  }
};

export const listarMensagensDaConversaController = async (req, res) => {
  const idUsuario = req.usuario.uid;
  const { id_usuario: idOutroUsuario } = req.params;
  const paginacao = validarPaginacao(req.query);

  if (!idOutroUsuario || idOutroUsuario === idUsuario) {
    return res.status(400).json({
      erro: 'Informe um ID de usuário válido e diferente do usuário autenticado'
    });
  }

  if (!paginacao) {
    return res.status(400).json({
      erro: `A paginação deve usar page maior que 0 e limit entre 1 e ${LIMITE_MAXIMO}`
    });
  }

  try {
    const resultado = await listarMensagensDaConversa(
      idUsuario,
      idOutroUsuario,
      paginacao.pagina,
      paginacao.limite
    );

    return res.json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao listar mensagens da conversa' });
  }
};

export const marcarMensagemComoLidaController = async (req, res) => {
  try {
    const resultado = await marcarMensagemComoLida(req.params.id, req.usuario.uid);

    if (resultado === 'nao_encontrada') {
      return res.status(404).json({ erro: 'Mensagem não encontrada' });
    }

    if (resultado === 'sem_permissao') {
      return res.status(403).json({
        erro: 'Somente o destinatário pode marcar a mensagem como lida'
      });
    }

    return res.json({ mensagem: 'Mensagem marcada como lida' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao marcar mensagem como lida' });
  }
};

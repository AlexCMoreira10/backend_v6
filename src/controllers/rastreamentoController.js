import {
  buscarRastreioPorToken,
  confirmarAquisicao,
  garantirQrCodeLivro,
  listarEstantePorUsuario,
  marcarEstadoAcervo,
  recusarAquisicao,
  registrarAvaliacao,
  solicitarAquisicaoPorToken
} from '../services/rastreamentoService.js';
import { buscarLivroPorId } from '../services/livroService.js';
import { gerarQrCode } from '../services/qrCodeService.js';

const responderErro = (res, error, mensagemPadrao) => {
  if (error.status) {
    return res.status(error.status).json({ erro: error.message });
  }

  console.error(error);
  return res.status(500).json({ erro: mensagemPadrao });
};

export const buscarRastreioController = async (req, res) => {
  try {
    const resultado = await buscarRastreioPorToken(req.params.token);
    if (!resultado) {
      return res.status(404).json({ erro: 'Livro não encontrado' });
    }

    return res.json(resultado);
  } catch (error) {
    return responderErro(res, error, 'Erro ao consultar o histórico do livro');
  }
};

export const solicitarAquisicaoController = async (req, res) => {
  try {
    const resultado = await solicitarAquisicaoPorToken(
      req.params.token,
      req.usuario.uid,
      req.usuario.name || '',
      req.body?.tipoNegociacao
    );
    return res.status(202).json({
      mensagem: 'Pedido de aquisição enviado ao proprietário atual',
      transferencia: resultado
    });
  } catch (error) {
    return responderErro(res, error, 'Erro ao solicitar aquisição do livro');
  }
};

export const confirmarAquisicaoController = async (req, res) => {
  try {
    const resultado = await confirmarAquisicao(req.params.id, req.usuario.uid);
    return res.json({
      mensagem: 'Transferência concluída',
      transferencia: resultado
    });
  } catch (error) {
    return responderErro(res, error, 'Erro ao confirmar aquisição do livro');
  }
};

export const recusarAquisicaoController = async (req, res) => {
  try {
    const resultado = await recusarAquisicao(req.params.id, req.usuario.uid);
    return res.json(resultado);
  } catch (error) {
    return responderErro(res, error, 'Erro ao recusar aquisição do livro');
  }
};

export const registrarAvaliacaoController = async (req, res) => {
  const comentario = req.body?.comentario;
  if (
    typeof comentario !== 'string' ||
    !comentario.trim() ||
    comentario.trim().length > 2000
  ) {
    return res.status(400).json({
      erro: 'O comentário deve conter entre 1 e 2000 caracteres'
    });
  }

  try {
    const resultado = await registrarAvaliacao(
      req.params.id,
      req.usuario.uid,
      comentario
    );
    return res.status(201).json(resultado);
  } catch (error) {
    return responderErro(res, error, 'Erro ao registrar avaliação do livro');
  }
};

export const atualizarEstadoAcervoController = async (req, res) => {
  try {
    const resultado = await marcarEstadoAcervo(
      req.params.id,
      req.usuario.uid,
      req.body?.estadoAcervo
    );
    return res.json(resultado);
  } catch (error) {
    return responderErro(res, error, 'Erro ao atualizar o estado do livro');
  }
};

export const listarEstanteController = async (req, res) => {
  try {
    const resultado = await listarEstantePorUsuario(req.usuario.uid, req.query);
    return res.json(resultado);
  } catch (error) {
    return responderErro(res, error, 'Erro ao listar a estante');
  }
};

export const obterQrCodeController = async (req, res) => {
  try {
    const livro = await buscarLivroPorId(req.params.id);
    if (!livro) {
      return res.status(404).json({ erro: 'Livro não encontrado' });
    }
    if (livro.usuarioId !== req.usuario.uid) {
      return res.status(403).json({ erro: 'Somente o proprietário pode obter o QR Code' });
    }

    const { qrUrl } = await garantirQrCodeLivro(req.params.id);
    return res.json({ qrUrl, qrCode: await gerarQrCode(qrUrl) });
  } catch (error) {
    return responderErro(res, error, 'Erro ao gerar QR Code do livro');
  }
};

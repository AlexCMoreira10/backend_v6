import { criarTroca, listarTrocasPorUsuario  } from '../services/trocaService.js';
import { buscarLivroPorId, atualizarLivro } from '../services/livroService.js';
import { criarNotificacao } from '../services/notificacaoService.js';

export const solicitarTrocaController = async (req, res) => {
  try {
    const { livroOfertadoId, livroDesejadoId } = req.body;
    const solicitanteId = req.usuario.uid;

    if (!livroOfertadoId || !livroDesejadoId) {
      return res.status(400).json({ erro: 'Dados obrigatórios' });
    }

    const livroOfertado = await buscarLivroPorId(livroOfertadoId);
    const livroDesejado = await buscarLivroPorId(livroDesejadoId);

    if (!livroOfertado || !livroDesejado) {
      return res.status(404).json({ erro: 'Livro não encontrado' });
    }

    // 🔐 Garantir que o usuário é dono do livro ofertado
    if (livroOfertado.usuarioId !== solicitanteId) {
      return res.status(403).json({
        erro: 'Você só pode oferecer seus próprios livros'
      });
    }

    // ❗ Não pode trocar com você mesmo
    if (livroDesejado.usuarioId === solicitanteId) {
      return res.status(400).json({
        erro: 'Não pode solicitar troca do próprio livro'
      });
    }
    
    //Livros ofertados e desejados devem estar disponíveis
    if (livroOfertado.status !== 'disponivel') {
        return res.status(400).json({
            erro: 'Seu livro não está disponível para troca'
        });
    }

    // 🚫 livro desejado indisponível
    if (livroDesejado.status !== 'disponivel') {
        return res.status(400).json({
            erro: 'O livro desejado não está disponível'
        });
    }

    const novaTroca = {
      livroOfertadoId,
      livroDesejadoId,
      solicitanteId,
      destinatarioId: livroDesejado.usuarioId,
      status: 'pendente',
      criadoEm: new Date()
    };

    const resultado = await criarTroca(novaTroca);
    
    await criarNotificacao({
      usuarioId: livroDesejado.usuarioId,
      mensagem: 'Você recebeu uma nova solicitação de troca',
      tipo: 'troca',
      lida: false,
      criadoEm: new Date()
    });

    return res.status(201).json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao solicitar troca'
    });
  }
};

export const aceitarTrocaController = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.uid;

    const troca = await buscarTrocaPorId(id);

    if (!troca) {
      return res.status(404).json({ erro: 'Troca não encontrada' });
    }

    // 🔐 só destinatário pode aceitar
    if (troca.destinatarioId !== usuarioId) {
      return res.status(403).json({
        erro: 'Sem permissão'
      });
    }

    if (troca.status !== 'pendente') {
      return res.status(400).json({
        erro: 'Troca já finalizada'
      });
    }

    // 🔄 Atualiza troca
    await atualizarTroca(id, { status: 'aceita' });

    // 🔥 Atualiza livros
    await atualizarLivro(troca.livroOfertadoId, { status: 'trocado' });
    await atualizarLivro(troca.livroDesejadoId, { status: 'trocado' });

    await criarNotificacao({
      usuarioId: troca.solicitanteId,
      mensagem: 'Sua troca foi aceita',
      tipo: 'troca',
      lida: false,
      criadoEm: new Date()
    });

    return res.json({ mensagem: 'Troca realizada com sucesso' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao aceitar troca'
    });
  }
};

export const recusarTrocaController = async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.uid;

    const troca = await buscarTrocaPorId(id);

    if (!troca) {
      return res.status(404).json({ erro: 'Troca não encontrada' });
    }

    if (troca.destinatarioId !== usuarioId) {
      return res.status(403).json({
        erro: 'Sem permissão'
      });
    }

    if (troca.status !== 'pendente') {
      return res.status(400).json({
        erro: 'Troca já finalizada'
      });
    }

    await atualizarTroca(id, { status: 'recusada' });
    
    await criarNotificacao({
      usuarioId: troca.solicitanteId,
      mensagem: 'Sua troca foi recusada',
      tipo: 'troca',
      lida: false,
      criadoEm: new Date()
    });
    
    return res.json({ mensagem: 'Troca recusada' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao recusar troca'
    });
  }
};

export const listarMinhasTrocasController = async (req, res) => {
  try {
    const usuarioId = req.usuario.uid;

    const resultado = await listarTrocasPorUsuario(usuarioId);

    return res.json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar trocas'
    });
  }
};
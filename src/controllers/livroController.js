import { 
    criarLivro, 
    listarLivros,
    buscarLivroPorId,
    atualizarLivro,
    deletarLivro,
    listarLivrosPorUsuario
} from '../services/livroService.js';

export const criarLivroController = async (req, res) => {
  try {
    const {
      titulo,
      autor,
      descricao,
      editora,
      anoPublicacao,
      generos,
      idioma,
      condicao,
      tipo,
      preco,
      trocas,
      fotos,
      localizacao
    } = req.body;

    if (!titulo || !autor) {
      return res.status(400).json({
        erro: 'Título e autor são obrigatórios'
      });
    }

    const condicoesValidas = ['novo', 'bom', 'regular', 'usado'];
    if (condicao && !condicoesValidas.includes(condicao)) {
      return res.status(400).json({
        erro: 'Condição inválida'
      });
    }

    const tiposValidos = ['doacao', 'troca', 'venda'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        erro: 'Tipo inválido'
      });
    }

    if (tipo === 'venda' && preco == null) {
      return res.status(400).json({
        erro: 'Preço é obrigatório para venda'
      });
    }

    if ((tipo === 'doacao' || tipo === 'troca') && preco != null) {
      return res.status(400).json({
        erro: 'Preço não permitido para doação ou troca'
      });
    }

    const usuarioId = req.usuario.uid;

    const novoLivro = {
      titulo,
      autor,
      descricao: descricao || '',
      editora: editora || '',
      anoPublicacao: anoPublicacao || null,
      generos: generos || [],
      idioma: idioma || '',
      condicao: condicao || 'bom',
      tipo,
      preco: preco || null,
      trocas: trocas || {},
      fotos: fotos || [],
      localizacao: localizacao || '',
      usuarioId,
      status: 'disponivel',
      criadoEm: new Date()
    };

    const resultado = await criarLivro(novoLivro);

    return res.status(201).json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao criar livro'
    });
  }
};

export const listarLivrosController = async (req, res) => {
  try {
    const filtros = req.query;

    const resultado = await listarLivros(filtros);

    return res.json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar livros'
    });
  }
};

export const atualizarLivroController = async (req, res) => {
  try {
    const { id } = req.params;
    const dados = req.body;

    // 🔍 Verifica se existe
    const livro = await buscarLivroPorId(id);

    if (!livro) {
      return res.status(404).json({
        erro: 'Livro não encontrado'
      });
    }

    // 🔐 Segurança: só dono pode editar
    if (livro.usuarioId !== req.usuario.uid) {
      return res.status(403).json({
        erro: 'Você não tem permissão para editar este livro'
      });
    }

    // 🔴 Validações
    const condicoesValidas = ['novo', 'bom', 'regular', 'usado'];
    if (dados.condicao && !condicoesValidas.includes(dados.condicao)) {
      return res.status(400).json({
        erro: 'Condição inválida'
      });
    }

    const tiposValidos = ['doacao', 'troca', 'venda'];
    if (dados.tipo && !tiposValidos.includes(dados.tipo)) {
      return res.status(400).json({
        erro: 'Tipo inválido'
      });
    }

    // 🔥 Regra de preço
    if (dados.tipo === 'venda' && dados.preco == null) {
      return res.status(400).json({
        erro: 'Preço obrigatório para venda'
      });
    }

    if ((dados.tipo === 'doacao' || dados.tipo === 'troca') && dados.preco != null) {
      return res.status(400).json({
        erro: 'Preço não permitido para doação/troca'
      });
    }

    // 🧹 Remove campos proibidos
    delete dados.usuarioId;
    delete dados.criadoEm;

    // 🧱 Atualiza
    const resultado = await atualizarLivro(id, dados);

    return res.json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao atualizar livro'
    });
  }
};

export const deletarLivroController = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔍 Verifica se existe
    const livro = await buscarLivroPorId(id);

    if (!livro) {
      return res.status(404).json({
        erro: 'Livro não encontrado'
      });
    }

    // 🔐 Segurança: só dono pode deletar
    if (livro.usuarioId !== req.usuario.uid) {
      return res.status(403).json({
        erro: 'Você não tem permissão para deletar este livro'
      });
    }

    // 🗑️ Deleta
    await deletarLivro(id);

    // ✅ Resposta padrão REST
    return res.status(204).send();

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao deletar livro'
    });
  }
};

export const listarMeusLivrosController = async (req, res) => {
  try {
    const usuarioId = req.usuario.uid;
    const filtros = req.query;

    const resultado = await listarLivrosPorUsuario(usuarioId, filtros);

    return res.json(resultado);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar livros do usuário'
    });
  }
};
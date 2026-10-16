import { randomBytes } from 'node:crypto';
import { 
    criarLivro, 
    listarLivros,
    buscarLivroPorId,
    atualizarLivro,
    listarLivrosPorUsuario,
    listarEstantePorUsuario,
    retirarAnuncio
} from '../services/livroService.js';
import { criarUrlRastreio, gerarQrCode } from '../services/qrCodeService.js';

export const criarLivroController = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ erro: 'O body deve ser um objeto JSON' });
    }

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
    const qrToken = randomBytes(24).toString('base64url');
    const qrUrl = criarUrlRastreio(qrToken);
    const qrCode = await gerarQrCode(qrUrl);

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
      preco: preco ?? null,
      trocas: trocas || {},
      fotos: fotos || [],
      localizacao: localizacao || '',
      usuarioId,
      usuarioNome: req.usuario.name || '',
      status: 'disponivel',
      estadoAcervo: 'normal',
      qrToken,
      qrUrl,
      criadoEm: new Date()
    };

    const resultado = await criarLivro(novoLivro);
    const resposta = { ...resultado, qrCode };
    delete resposta.qrToken;
    return res.status(201).json(resposta);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao criar livro'
    });
  }
};

export const listarLivrosController = async (req, res) => {
  try {
    const { id } = req.params;

    if (id) {
      const livro = await buscarLivroPorId(id);

      if (!livro) {
        return res.status(404).json({
          erro: 'Livro não encontrado'
        });
      }

      delete livro.qrToken;
      if (livro.usuarioId !== req.usuario.uid) {
        delete livro.transferenciaPendente;
      }
      return res.json(livro);
    }

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
    const camposEditaveis = [
      'titulo',
      'autor',
      'descricao',
      'editora',
      'anoPublicacao',
      'generos',
      'idioma',
      'condicao',
      'tipo',
      'preco',
      'trocas',
      'fotos',
      'localizacao',
      'status'
    ];
    const body = req.body;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ erro: 'O body deve ser um objeto JSON' });
    }

    const camposInvalidos = Object.keys(body).filter(
      (campo) => !camposEditaveis.includes(campo)
    );
    if (camposInvalidos.length) {
      return res.status(400).json({
        erro: `Campos não editáveis: ${camposInvalidos.join(', ')}`
      });
    }
    const dados = Object.fromEntries(
      Object.entries(body).filter(([campo]) => camposEditaveis.includes(campo))
    );
    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um campo válido para atualizar' });
    }

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
    if (livro.transferenciaPendente) {
      return res.status(409).json({
        erro: 'Conclua ou recuse a aquisição pendente antes de editar este livro'
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

    const statusValidos = ['disponivel', 'reservado', 'trocado', 'vendido', 'na_estante'];
    if (dados.status && !statusValidos.includes(dados.status)) {
      return res.status(400).json({ erro: 'Status inválido' });
    }

    const tipoFinal = dados.tipo ?? livro.tipo;
    const precoFinal = Object.hasOwn(dados, 'preco') ? dados.preco : livro.preco;
    if (tipoFinal === 'venda' && precoFinal == null) {
      return res.status(400).json({
        erro: 'Preço obrigatório para venda'
      });
    }

    if ((tipoFinal === 'doacao' || tipoFinal === 'troca') && precoFinal != null) {
      if (!Object.hasOwn(dados, 'preco')) {
        dados.preco = null;
      } else {
        return res.status(400).json({
          erro: 'Preço não permitido para doação/troca'
        });
      }
    }

    // 🧱 Atualiza
    const resultado = await atualizarLivro(id, dados, req.usuario.uid);

    return res.json(resultado);

  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ erro: error.message });
    }
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao atualizar livro'
    });
  }
};

export const deletarLivroController = async (req, res) => {
  try {
    const resultado = await retirarAnuncio(req.params.id, req.usuario.uid);
    return res.json({
      mensagem: 'Anúncio removido do catálogo; o livro continua na sua estante',
      ...resultado
    });

  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ erro: error.message });
    }
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

export const listarEstanteController = async (req, res) => {
  try {
    const resultado = await listarEstantePorUsuario(req.usuario.uid, req.query);
    return res.json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar a estante'
    });
  }
};
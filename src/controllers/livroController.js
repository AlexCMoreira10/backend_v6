import { buscarSeboPorId } from '../services/seboService.js';
import {
  criarLivroImportadoSebo,
  persistirLivro,
  validarDadosNovoLivro
} from '../services/livroCreationService.js';
import {
  removerImagensLivro,
  salvarImagemLivro
} from '../services/seboImageService.js';
import {
  criarLivro,
  listarLivros,
  buscarLivroPorId,
  atualizarLivro,
  listarLivrosPorUsuario,
  listarEstantePorUsuario,
  retirarAnuncio
} from '../services/livroService.js';
import { garantirQrCodeLivro } from '../services/rastreamentoService.js';
import { gerarQrCode } from '../services/qrCodeService.js';
export const criarLivroController = async (req, res) => {
  const erro = validarDadosNovoLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  try {
    const livro = await persistirLivro({
      dados: req.body,
      usuarioId: req.usuario.uid,
      usuarioNome: req.usuario.name || ''
    });
    return res.status(201).json(livro);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao criar livro' });
  }
};

export const criarLivroSeboController = async (req, res) => {
  const erro = validarDadosNovoLivro(req.body, true);
  if (erro) return res.status(400).json({ erro });
  try {
    const sebo = await buscarSeboPorId(req.seboId);
    if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    const livro = await criarLivroImportadoSebo({
      seboId: req.seboId,
      seboNome: sebo.nome,
      dados: req.body,
      geocodeSebo: sebo.geocode
    });
    return res.status(201).json(livro);
  } catch (error) {
    console.error('Erro ao criar livro para o sebo:', error);
    return res.status(500).json({ erro: 'Erro ao criar livro para o sebo' });
  }
};

export const listarLivrosSeboController = async (req, res) => {
  try {
    const resultado = await listarLivrosPorUsuario(req.seboId, req.query);
    const dados = await Promise.all(resultado.dados.map(async (livro) => {
      const { qrUrl } = livro.qrUrl
        ? livro
        : await garantirQrCodeLivro(livro.id);
      const livroSeguro = { ...livro };
      delete livroSeguro.qrToken;
      return {
        ...livroSeguro,
        qrUrl,
        qrCode: await gerarQrCode(qrUrl)
      };
    }));
    return res.json({ ...resultado, dados });
  } catch (error) {
    console.error('Erro ao listar livros do sebo:', error);
    return res.status(500).json({ erro: 'Não foi possível listar os livros do sebo' });
  }
};

export const enviarImagemLivroController = async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ erro: 'Envie uma imagem válida' });
  }

  try {
    const imagem = await salvarImagemLivro({
      seboId: req.seboId,
      contentType: req.headers['content-type'],
      conteudo: req.body
    });
    return res.status(201).json(imagem);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao salvar imagem do livro:', error);
    return res.status(500).json({ erro: 'Não foi possível salvar a imagem do livro' });
  }
};

export const removerImagensLivroController = async (req, res) => {
  const { paths } = req.body || {};
  if (!Array.isArray(paths) || paths.length > 5) {
    return res.status(400).json({ erro: 'Informe uma lista válida de até 5 imagens' });
  }

  try {
    await removerImagensLivro({ seboId: req.seboId, paths });
    return res.status(204).end();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao remover imagens temporárias do livro:', error);
    return res.status(500).json({ erro: 'Não foi possível remover as imagens temporárias' });
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
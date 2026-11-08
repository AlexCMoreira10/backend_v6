import { timingSafeEqual } from 'node:crypto';
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
  listarLivrosProximos,
  buscarLivroPorId,
  atualizarLivro,
  listarLivrosPorUsuario,
  listarEstantePorUsuario,
  retirarAnuncio
} from '../services/livroService.js';
import { garantirQrCodeLivro } from '../services/rastreamentoService.js';
import { gerarQrCode } from '../services/qrCodeService.js';
import { validarDimensoesEnvio } from '../utils/dimensoesEnvio.js';
import { buscarUsuarioPorId } from '../services/userService.js';
import { removerGeolocalizacaoLivro } from '../utils/bookLocationPrivacy.js';
import {
  buscarRascunhoLivro,
  criarRascunhoImagensLivro,
  criarRascunhoLivro,
  descartarRascunhoLivro,
  limparRascunhosExpirados,
  validarFotosLivro
} from '../services/livroDraftService.js';

export const criarLivroController = async (req, res) => {
  const erro = validarDadosNovoLivro(req.body);
  if (erro) return res.status(400).json({ erro });
  try {
    const perfil = await buscarUsuarioPorId(req.usuario.uid);
    const fotosExternas = req.body.fotosExternas ?? req.body.fotos ?? [];
    const dadosLivro = { ...req.body, fotos: [] };
    delete dadosLivro.fotosExternas;
    dadosLivro.localizacao = perfil?.endereco?.cep || '';
    const rascunho = await criarRascunhoLivro({
      dados: dadosLivro,
      fotosExternas,
      usuarioId: req.usuario.uid,
      usuarioNome: req.usuario.name || '',
      geocodeUsuario: perfil?.geocode
    });
    return res.status(202).json(rascunho);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error(error);
    return res.status(500).json({ erro: 'Erro ao criar rascunho do livro' });
  }
};

export const publicarRascunhoLivroController = async (req, res) => {
  try {
    const { id } = req.params;
    const fotos = req.body?.fotos;
    if (!Array.isArray(fotos)) {
      return res.status(400).json({ erro: 'Envie a lista final de imagens do anúncio' });
    }

    const rascunho = await buscarRascunhoLivro(id);
    if (!rascunho) {
      const livroExistente = await buscarLivroPorId(id);
      if (livroExistente?.usuarioId === req.usuario.uid &&
          JSON.stringify(livroExistente.fotos || []) === JSON.stringify(fotos)) {
        return res.json({
          ...livroExistente,
          qrCode: await gerarQrCode(livroExistente.qrUrl)
        });
      }
      return res.status(404).json({ erro: 'Rascunho não encontrado ou expirado' });
    }
    if (rascunho.usuarioId !== req.usuario.uid) {
      return res.status(403).json({ erro: 'Você não tem permissão para publicar este rascunho' });
    }
    if (rascunho.tipoRascunho !== 'criacao' || rascunho.estado !== 'enviando') {
      return res.status(409).json({ erro: 'Este rascunho não pode ser publicado' });
    }
    if (rascunho.expiraEm.toDate() <= new Date()) {
      return res.status(410).json({ erro: 'O rascunho expirou; inicie a publicação novamente' });
    }

    const fotosExternas = rascunho.fotosExternas || [];
    if (fotosExternas.some((foto) => !fotos.includes(foto))) {
      return res.status(400).json({ erro: 'A publicação deve manter as URLs externas do rascunho' });
    }
    await validarFotosLivro({
      fotos,
      usuarioId: req.usuario.uid,
      livroId: rascunho.livroId,
      uploadId: id,
      fotosExistentes: fotosExternas
    });

    const livro = await persistirLivro({
      dados: { ...rascunho.dados, fotos },
      usuarioId: req.usuario.uid,
      usuarioNome: rascunho.usuarioNome || req.usuario.name || '',
      geocodeUsuario: rascunho.dados.geocode,
      livroId: rascunho.livroId,
      rascunhoId: id
    });
    return res.status(201).json(livro);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao publicar rascunho do livro:', error);
    return res.status(500).json({ erro: 'Não foi possível publicar o livro' });
  }
};

export const criarRascunhoImagensLivroController = async (req, res) => {
  try {
    const rascunho = await criarRascunhoImagensLivro({
      livroId: req.params.id,
      usuarioId: req.usuario.uid
    });
    return res.status(201).json(rascunho);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao iniciar atualização das imagens do livro:', error);
    return res.status(500).json({ erro: 'Não foi possível preparar as novas imagens' });
  }
};

export const descartarRascunhoLivroController = async (req, res) => {
  try {
    const { id, draftId } = req.params;
    const rascunhoId = draftId || id;
    const rascunho = await buscarRascunhoLivro(rascunhoId);
    if (!rascunho) return res.status(204).end();
    if (rascunho.usuarioId !== req.usuario.uid ||
        (id && (rascunho.tipoRascunho !== 'edicao' || rascunho.livroId !== id)) ||
        (draftId && rascunho.tipoRascunho !== 'criacao')) {
      return res.status(403).json({ erro: 'Você não tem permissão para descartar este rascunho' });
    }

    await descartarRascunhoLivro(rascunhoId, req.usuario.uid);
    return res.status(204).end();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao descartar rascunho do livro:', error);
    return res.status(500).json({ erro: error.message || 'Não foi possível descartar o rascunho' });
  }
};

export const limparRascunhosExpiradosController = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const autorizacao = req.headers.authorization || '';
  const recebido = autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : '';
  if (!secret) {
    return res.status(503).json({ erro: 'CRON_SECRET não está configurado' });
  }

  const recebidoBuffer = Buffer.from(recebido);
  const esperadoBuffer = Buffer.from(secret);
  if (recebidoBuffer.length !== esperadoBuffer.length ||
      !timingSafeEqual(recebidoBuffer, esperadoBuffer)) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  try {
    const resultado = await limparRascunhosExpirados();
    if (resultado.falhas) {
      return res.status(500).json({
        erro: 'Alguns uploads expirados não puderam ser limpos',
        ...resultado
      });
    }
    return res.json(resultado);
  } catch (error) {
    console.error('Erro na limpeza agendada de rascunhos:', error);
    return res.status(500).json({ erro: 'Não foi possível limpar os rascunhos expirados' });
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
        return res.json(removerGeolocalizacaoLivro(livro));
      }
      return res.json(livro);
    }

    const filtros = req.query;
    const resultado = await listarLivros(filtros);

    return res.json({
    ...resultado,
    dados: resultado.dados.map(removerGeolocalizacaoLivro)
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      erro: 'Erro ao listar livros'
    });
  }
};

export const listarLivrosProximosController = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ erro: 'O body deve ser um objeto JSON' });
  }
  const camposPermitidos = new Set([
    'latitude',
    'longitude',
    'raioKm',
    'tipo',
    'titulo',
    'page',
    'limit'
  ]);
  const campoInvalido = Object.keys(body).find(campo => !camposPermitidos.has(campo));
  if (campoInvalido) {
    return res.status(400).json({ erro: `Campo não permitido: ${campoInvalido}` });
  }
  if (
    !Number.isFinite(body.latitude) ||
    body.latitude < -90 ||
    body.latitude > 90 ||
    !Number.isFinite(body.longitude) ||
    body.longitude < -180 ||
    body.longitude > 180
  ) {
    return res.status(400).json({ erro: 'Informe latitude e longitude válidas' });
  }
  if (![3, 5, 10].includes(Number(body.raioKm))) {
    return res.status(400).json({ erro: 'O raio deve ser 3, 5 ou 10 km' });
  }
  if (body.tipo && !['troca', 'doacao', 'venda'].includes(body.tipo)) {
    return res.status(400).json({ erro: 'Tipo de anúncio inválido' });
  }
  if (body.titulo !== undefined &&
      (typeof body.titulo !== 'string' || body.titulo.length > 200)) {
    return res.status(400).json({ erro: 'O título da busca deve ter até 200 caracteres' });
  }
  if (body.page !== undefined && (!Number.isInteger(Number(body.page)) || Number(body.page) < 1)) {
    return res.status(400).json({ erro: 'A página deve ser um inteiro positivo' });
  }
  if (body.limit !== undefined && (!Number.isInteger(Number(body.limit)) || Number(body.limit) < 1 || Number(body.limit) > 100)) {
    return res.status(400).json({ erro: 'O limite deve ser um inteiro entre 1 e 100' });
  }

  try {
    const resultado = await listarLivrosProximos(body);
    return res.json({
      ...resultado,
      dados: resultado.dados.map(livro => ({
        ...removerGeolocalizacaoLivro(livro),
        distanciaKm: livro.distanciaKm
      }))
    });
  } catch (error) {
    console.error('Erro ao buscar livros próximos:', error);
    return res.status(500).json({ erro: 'Não foi possível buscar livros próximos' });
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
      'dimensoes',
      'trocas',
      'fotos',
      'imageDraftId',
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
    const imageDraftId = typeof body.imageDraftId === 'string'
      ? body.imageDraftId
      : null;
    delete dados.imageDraftId;
    if (body.imageDraftId !== undefined &&
        (!imageDraftId || !Object.hasOwn(body, 'fotos'))) {
      return res.status(400).json({
        erro: 'Um rascunho de imagens exige a lista final de fotos do anúncio'
      });
    }
    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um campo válido para atualizar' });
    }
    const erroDimensoes = validarDimensoesEnvio(dados.dimensoes);
    if (erroDimensoes) return res.status(400).json({ erro: erroDimensoes });

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
    if (Object.hasOwn(body, 'fotos')) {
      const fotosExistentes = Array.isArray(livro.fotos)
        ? livro.fotos
        : typeof livro.fotos === 'string'
          ? livro.fotos.split(',').map((foto) => foto.trim()).filter(Boolean)
          : [];
      await validarFotosLivro({
        fotos: dados.fotos,
        usuarioId: req.usuario.uid,
        livroId: id,
        uploadId: imageDraftId,
        fotosExistentes
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
    const resultado = await atualizarLivro(id, dados, req.usuario.uid, { imageDraftId });

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
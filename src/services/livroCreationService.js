import { randomBytes } from 'node:crypto';
import {
  criarLivro
} from './livroService.js';
import { criarUrlRastreio, gerarQrCode } from './qrCodeService.js';
import { validarUrlsFotos } from '../utils/bookPhotoUrls.js';

export const validarDadosNovoLivro = (dados, exigirDadosSebo = false) => {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    return 'O body deve ser um objeto JSON';
  }
  const erroFotos = validarUrlsFotos(dados.fotos);
  if (erroFotos) return erroFotos;
  if (!dados.titulo || !dados.autor) return 'Título e autor são obrigatórios';
  if (exigirDadosSebo && (typeof dados.localizacao !== 'string' || !dados.localizacao.trim())) {
    return 'A localização do livro no sebo é obrigatória';
  }
  if (
    exigirDadosSebo &&
    (!Number.isSafeInteger(dados.quantidadeEstoque) || dados.quantidadeEstoque < 1)
  ) {
    return 'A quantidade em estoque deve ser um número inteiro maior que zero';
  }
  if (
    exigirDadosSebo &&
    dados.anoPublicacao != null &&
    (!Number.isInteger(dados.anoPublicacao) ||
      dados.anoPublicacao < 1500 ||
      dados.anoPublicacao > new Date().getFullYear())
  ) {
    return `O ano de publicação deve estar entre 1500 e ${new Date().getFullYear()}`;
  }
  if (dados.condicao && !['novo', 'bom', 'regular', 'usado'].includes(dados.condicao)) {
    return 'Condição inválida';
  }
  if (!['doacao', 'troca', 'venda'].includes(dados.tipo)) return 'Tipo inválido';
  if (dados.tipo === 'venda' && dados.preco == null) return 'Preço é obrigatório para venda';
  if (
    (dados.tipo === 'doacao' || dados.tipo === 'troca') &&
    dados.preco != null
  ) {
    return 'Preço não permitido para doação ou troca';
  }
  return null;
};

export const persistirLivro = async ({ dados, usuarioId, usuarioNome, seboId, seboNome }) => {
  const qrToken = randomBytes(24).toString('base64url');
  const qrUrl = criarUrlRastreio(qrToken);
  const qrCode = await gerarQrCode(qrUrl);
  const novoLivro = {
    titulo: dados.titulo,
    autor: dados.autor,
    descricao: dados.descricao || '',
    editora: dados.editora || '',
    anoPublicacao: dados.anoPublicacao || null,
    generos: dados.generos || [],
    idioma: dados.idioma || '',
    condicao: dados.condicao || 'bom',
    tipo: dados.tipo,
    preco: dados.preco ?? null,
    trocas: dados.trocas || {},
    fotos: dados.fotos || [],
    localizacao: dados.localizacao || '',
    usuarioId,
    usuarioNome,
    status: 'disponivel',
    estadoAcervo: 'normal',
    qrToken,
    qrUrl,
    criadoEm: new Date(),
    ...(seboId ? { seboId, seboNome, quantidadeEstoque: dados.quantidadeEstoque } : {})
  };
  const resultado = await criarLivro(novoLivro);
  const resposta = { ...resultado, qrCode };
  delete resposta.qrToken;
  return resposta;
};

export const criarLivroImportadoSebo = async ({ seboId, seboNome, dados }) => {
  const erro = validarDadosNovoLivro(dados, true);
  if (erro) {
    const falha = new Error(erro);
    falha.status = 400;
    throw falha;
  }
  return persistirLivro({
    dados,
    usuarioId: seboId,
    usuarioNome: seboNome,
    seboId,
    seboNome
  });
};

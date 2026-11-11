import ExcelJS from 'exceljs';
import { validarUrlsExternasLivro } from './bookPhotoReference.js';

export const COLUNAS_IMPORTACAO_LIVROS = [
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
  'localizacao',
  'quantidadeEstoque',
  'pesoGramas',
  'alturaCm',
  'larguraCm',
  'comprimentoCm',
  'imagens'
];

const CAMPOS_DIMENSOES_IMPORTACAO = [
  ['pesoGramas', 'peso'],
  ['alturaCm', 'altura'],
  ['larguraCm', 'largura'],
  ['comprimentoCm', 'comprimento']
];
const MAXIMO_URL_IMAGEM = 2048;
const bucketNome = process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.FIREBASE_PROJECT_ID || ''}.firebasestorage.app`;

const textoDaCelula = (cell) => {
  if (cell.type === ExcelJS.ValueType.Formula) {
    throw new Error('Fórmulas não são aceitas; informe um valor direto.');
  }
  const valor = cell.value;
  if (valor == null) return '';
  if (typeof valor === 'object') {
    if (Array.isArray(valor.richText)) {
      return valor.richText.map((item) => item.text).join('').trim();
    }
    if ('text' in valor && typeof valor.text === 'string') return valor.text.trim();
    throw new Error('Tipo de célula não suportado.');
  }
  return String(valor).trim();
};

const numeroDaCelula = (valor, nome, { inteiro = false, opcional = false } = {}) => {
  if ((valor == null || valor === '') && opcional) return null;
  if (valor == null || valor === '') throw new Error(`Preencha a coluna ${nome}.`);
  const numero = Number(valor);
  if (!Number.isFinite(numero) || (inteiro && !Number.isSafeInteger(numero))) {
    throw new Error(`A coluna ${nome} precisa conter ${inteiro ? 'um número inteiro' : 'um número válido'}.`);
  }
  return numero;
};

const normalizarDimensoes = (valores) => {
  const camposPreenchidos = CAMPOS_DIMENSOES_IMPORTACAO
    .filter(([campo]) => valores[campo] !== undefined && valores[campo] !== '')
    .map(([campo]) => campo);
  if (!camposPreenchidos.length) return undefined;

  const faltantes = CAMPOS_DIMENSOES_IMPORTACAO
    .filter(([campo]) => valores[campo] === undefined || valores[campo] === '')
    .map(([campo]) => campo);
  if (faltantes.length) {
    throw new Error(`Preencha todas as dimensões do pacote ou deixe todas vazias. Campos faltantes: ${faltantes.join(', ')}.`);
  }

  const dimensoes = {};
  for (const [campoPlanilha, campoLivro] of CAMPOS_DIMENSOES_IMPORTACAO) {
    const valorInformado = valores[campoPlanilha];
    if (!/^\d+(?:\.\d+)?$/.test(valorInformado)) {
      throw new Error(`${campoPlanilha} deve conter somente um número, sem unidade.`);
    }
    const valor = numeroDaCelula(valorInformado, campoPlanilha);
    if (valor <= 0) throw new Error(`${campoPlanilha} deve ser maior que zero.`);
    dimensoes[campoLivro] = valor;
  }
  return dimensoes;
};

const normalizarImagens = (valor = '') => {
  const fotos = String(valor ?? '')
    .split(';')
    .map((url) => url.trim())
    .filter(Boolean);

  if (fotos.some((url) => url.length > MAXIMO_URL_IMAGEM)) {
    throw new Error(`imagens: cada URL deve ter no máximo ${MAXIMO_URL_IMAGEM} caracteres.`);
  }
  const erro = validarUrlsExternasLivro(fotos, bucketNome);
  if (erro) throw new Error(`imagens: ${erro}.`);
  return fotos;
};

export const normalizarLinhaImportacaoLivro = (valores, anoAtual = new Date().getFullYear()) => {
  const titulo = String(valores.titulo || '').trim();
  const autor = String(valores.autor || '').trim();
  if (!titulo) throw new Error('Preencha a coluna titulo.');
  if (!autor) throw new Error('Preencha a coluna autor.');

  const anoPublicacao = numeroDaCelula(valores.anoPublicacao, 'anoPublicacao', { inteiro: true, opcional: true });
  if (anoPublicacao != null && (anoPublicacao < 1500 || anoPublicacao > anoAtual)) {
    throw new Error(`anoPublicacao deve estar entre 1500 e ${anoAtual}.`);
  }

  const tipo = String(valores.tipo || 'venda').trim().toLowerCase();
  if (!['venda', 'troca', 'doacao'].includes(tipo)) {
    throw new Error('tipo deve ser venda, troca ou doacao.');
  }

  const condicao = String(valores.condicao || 'bom').trim().toLowerCase();
  if (!['novo', 'bom', 'regular', 'usado'].includes(condicao)) {
    throw new Error('condicao deve ser novo, bom, regular ou usado.');
  }

  const localizacao = String(valores.localizacao || '').trim();
  if (!localizacao) throw new Error('Preencha a coluna localizacao.');

  const quantidadeEstoque = numeroDaCelula(
    valores.quantidadeEstoque == null || valores.quantidadeEstoque === ''
      ? '1'
      : valores.quantidadeEstoque,
    'quantidadeEstoque',
    { inteiro: true }
  );
  if (quantidadeEstoque < 1) throw new Error('quantidadeEstoque deve ser maior que zero.');

  const preco = numeroDaCelula(valores.preco, 'preco', { opcional: tipo !== 'venda' });
  if (tipo === 'venda' && (preco == null || preco <= 0)) {
    throw new Error('preco deve ser maior que zero para anúncios de venda.');
  }
  if (tipo !== 'venda' && preco != null) {
    throw new Error('preco deve ficar vazio quando tipo for troca ou doacao.');
  }

  const dimensoes = normalizarDimensoes(valores);
  const fotos = normalizarImagens(valores.imagens);

  return {
    titulo,
    autor,
    descricao: String(valores.descricao || '').trim(),
    editora: String(valores.editora || '').trim(),
    anoPublicacao,
    generos: String(valores.generos || '')
      .split(';')
      .map((genero) => genero.trim())
      .filter(Boolean),
    idioma: String(valores.idioma || 'Português (Brasil)').trim(),
    condicao,
    tipo,
    preco,
    localizacao,
    quantidadeEstoque,
    ...(dimensoes ? { dimensoes } : {}),
    fotos
  };
};

export const criarModeloImportacaoLivros = async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Estante Parceiros';
  workbook.subject = 'Modelo para anunciar livros em massa';
  const sheet = workbook.addWorksheet('Livros');
  sheet.columns = COLUNAS_IMPORTACAO_LIVROS.map((key) => ({
    header: key,
    key,
    width: Math.max(key.length + 4, 18)
  }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUNAS_IMPORTACAO_LIVROS.length }
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF315C50' }
  };

  const instructions = workbook.addWorksheet('Instruções');
  instructions.columns = [
    { header: 'Campo', key: 'campo', width: 24 },
    { header: 'Como preencher', key: 'instrucao', width: 88 }
  ];
  instructions.addRows([
    { campo: 'Uso', instrucao: 'Preencha uma linha por livro na aba Livros. Não altere os nomes dos cabeçalhos.' },
    { campo: 'Obrigatórios', instrucao: 'titulo, autor, tipo, preco (para venda), localizacao. Os campos novos são opcionais.' },
    { campo: 'tipo', instrucao: 'Use venda, troca ou doacao. Para troca ou doacao, deixe preco vazio.' },
    { campo: 'condicao', instrucao: 'Use novo, bom, regular ou usado. Se vazio, será usado bom.' },
    { campo: 'anoPublicacao', instrucao: `Opcional; use um ano inteiro entre 1500 e ${new Date().getFullYear()}.` },
    { campo: 'generos', instrucao: 'Opcional; separe vários gêneros com ponto e vírgula (;).' },
    { campo: 'idioma', instrucao: 'Opcional; se vazio, será usado Português (Brasil).' },
    { campo: 'quantidadeEstoque', instrucao: 'Número inteiro maior que zero; se vazio, será usado 1.' },
    { campo: 'localizacao', instrucao: 'Obrigatória; informe onde o livro fica no sebo (ex.: Loja Centro, estante A, prateleira 2).' },
    { campo: 'Dimensões do pacote', instrucao: 'pesoGramas, alturaCm, larguraCm e comprimentoCm são opcionais, mas devem ser preenchidos juntos. São medidas do pacote preparado para envio, não do livro. Informe apenas números, sem unidades; peso em gramas e medidas em centímetros. Se deixar todos vazios, o anúncio ficará sem dimensões para cotação de frete.' },
    { campo: 'Exemplo de pacote', instrucao: 'pesoGramas: 450; alturaCm: 4; larguraCm: 15; comprimentoCm: 22.' },
    { campo: 'Imagens', instrucao: 'Opcional; informe até 5 URLs HTTPS públicas e diretas, separadas por ponto e vírgula (;). Cada URL pode ter até 2048 caracteres e não pode exigir autenticação.' },
    { campo: 'Exemplo de imagens', instrucao: 'URL HTTPS pública da capa; URL HTTPS pública da contracapa. Não use URLs do Firebase Storage; o importador não baixa nem copia imagens.' },
    { campo: 'Formatos de imagem', instrucao: 'Use URLs que exibam diretamente uma imagem pública (JPEG, PNG ou WebP). O servidor valida e armazena as URLs, sem baixar o conteúdo.' },
    { campo: 'Limites', instrucao: 'Envie somente arquivos .xlsx com até 100 livros por planilha.' }
  ]);
  instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  instructions.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF315C50' }
  };

  return workbook.xlsx.writeBuffer();
};

export const lerPlanilhaImportacaoLivros = async (conteudo) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(conteudo);
  const sheet = workbook.getWorksheet('Livros') || workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) throw new Error('A planilha não contém uma aba de livros.');

  const cabecalhosConhecidos = new Map(
    COLUNAS_IMPORTACAO_LIVROS.map((campo) => [campo.toLowerCase(), campo])
  );
  const cabecalhos = new Map();
  sheet.getRow(1).eachCell((cell, numeroColuna) => {
    const nomeOriginal = textoDaCelula(cell);
    const nome = cabecalhosConhecidos.get(nomeOriginal.toLowerCase());
    if (nome) {
      if (cabecalhos.has(nome)) throw new Error(`O cabeçalho ${nome} está duplicado.`);
      cabecalhos.set(nome, numeroColuna);
    }
  });
  const faltantes = ['titulo', 'autor', 'localizacao']
    .filter((campo) => !cabecalhos.has(campo));
  if (faltantes.length) {
    throw new Error(`Cabeçalhos obrigatórios ausentes: ${faltantes.join(', ')}.`);
  }
  const linhas = [];
  sheet.eachRow({ includeEmpty: false }, (row, numeroLinha) => {
    if (numeroLinha === 1) return;

    let valores;
    try {
      valores = Object.fromEntries([...cabecalhos].map(([nome, numeroColuna]) => [
        nome,
        textoDaCelula(row.getCell(numeroColuna))
      ]));
    } catch (error) {
      linhas.push({ numeroLinha, valores: {}, erro: error.message });
      if (linhas.length > 100) {
        throw new Error('A planilha pode conter no máximo 100 livros por envio.');
      }
      return;
    }
    if (Object.values(valores).every((valor) => valor === '')) return;

    linhas.push({ numeroLinha, valores });
    if (linhas.length > 100) {
      throw new Error('A planilha pode conter no máximo 100 livros por envio.');
    }
  });

  if (!linhas.length) throw new Error('Adicione ao menos uma linha de livro na aba Livros.');
  return linhas;
};

export const criarRelatorioImportacaoLivros = async (resultados) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Resultado');
  sheet.columns = [
    { header: 'linhaPlanilha', key: 'numeroLinha', width: 16 },
    ...COLUNAS_IMPORTACAO_LIVROS.map((key) => ({
      header: key,
      key,
      width: Math.max(key.length + 4, 18)
    })),
    { header: 'resultado', key: 'resultado', width: 18 },
    { header: 'idLivro', key: 'idLivro', width: 38 },
    { header: 'erro', key: 'erro', width: 60 }
  ];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length }
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF315C50' }
  };
  sheet.addRows(resultados.map((resultado) => ({
    numeroLinha: resultado.numeroLinha,
    ...resultado.valores,
    resultado: resultado.idLivro ? 'Cadastrado' : 'Rejeitado',
    idLivro: resultado.idLivro || '',
    erro: resultado.erro || ''
  })));
  return workbook.xlsx.writeBuffer();
};

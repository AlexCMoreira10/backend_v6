import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  COLUNAS_IMPORTACAO_LIVROS,
  criarModeloImportacaoLivros,
  criarRelatorioImportacaoLivros,
  lerPlanilhaImportacaoLivros,
  normalizarLinhaImportacaoLivro
} from '../src/utils/bookImport.js';
import { criarCriadorLivroSebo } from '../src/services/seboBookCreationService.js';

const COLUNAS_IMPORTACAO_LEGADAS = COLUNAS_IMPORTACAO_LIVROS.slice(0, 12);

const criarPlanilhaComLivros = async (quantidade, { linhaFormatada } = {}) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Livros');
  sheet.addRow(COLUNAS_IMPORTACAO_LIVROS);
  for (let indice = 1; indice <= quantidade; indice += 1) {
    sheet.addRow([
      `Livro ${indice}`,
      'Uma Autora',
      '',
      '',
      '',
      '',
      '',
      '',
      'venda',
      25,
      'Estante A',
      1
    ]);
  }
  if (linhaFormatada) {
    sheet.getRow(linhaFormatada).getCell(26).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFFF' }
    };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

test('normalizes a valid spreadsheet row and applies documented defaults', () => {
  const livro = normalizarLinhaImportacaoLivro({
    titulo: 'O Livro',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25.50',
    generos: 'Fantasia; Romance',
    quantidadeEstoque: ''
  }, 2026);

  assert.equal(livro.tipo, 'venda');
  assert.equal(livro.idioma, 'Português (Brasil)');
  assert.equal(livro.condicao, 'bom');
  assert.equal(livro.quantidadeEstoque, 1);
  assert.equal(livro.preco, 25.5);
  assert.deepEqual(livro.generos, ['Fantasia', 'Romance']);
  assert.deepEqual(livro.fotos, []);
  assert.equal(Object.hasOwn(livro, 'dimensoes'), false);
});

test('rejects invalid publication years, stock quantities and sale prices', () => {
  const base = {
    titulo: 'O Livro',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25'
  };
  assert.throws(
    () => normalizarLinhaImportacaoLivro({ ...base, anoPublicacao: '1499' }, 2026),
    /anoPublicacao/
  );
  assert.throws(
    () => normalizarLinhaImportacaoLivro({ ...base, quantidadeEstoque: '0' }, 2026),
    /quantidadeEstoque/
  );
  assert.throws(
    () => normalizarLinhaImportacaoLivro({ ...base, preco: '' }, 2026),
    /preco/
  );
});

test('creates a downloadable workbook template accepted by the importer', async () => {
  const workbookBytes = await criarModeloImportacaoLivros();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(workbookBytes));
  assert.deepEqual(
    workbook.getWorksheet('Livros').getRow(1).values.slice(1),
    COLUNAS_IMPORTACAO_LIVROS
  );
  assert.ok(workbook.getWorksheet('Instruções'));
  const instrucoes = workbook.getWorksheet('Instruções').getColumn(1).values;
  assert.ok(instrucoes.includes('Dimensões do pacote'));
  assert.ok(instrucoes.includes('Imagens'));
  workbook.getWorksheet('Livros').addRow([
    'O Livro',
    'Uma Autora',
    '',
    '',
    '',
    '',
    '',
    '',
    'venda',
    25,
    'Estante A',
    1
  ]);
  const rows = await lerPlanilhaImportacaoLivros(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valores.titulo, 'O Livro');
});

test('imports legacy 12-column workbooks without package measurements or images', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Livros');
  sheet.addRow(COLUNAS_IMPORTACAO_LEGADAS);
  sheet.addRow([
    'Livro legado',
    'Uma Autora',
    '',
    '',
    '',
    '',
    '',
    '',
    'venda',
    25,
    'Estante A',
    1
  ]);
  const rows = await lerPlanilhaImportacaoLivros(
    Buffer.from(await workbook.xlsx.writeBuffer())
  );
  const livro = normalizarLinhaImportacaoLivro(rows[0].valores, 2026);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valores.imagens, undefined);
  assert.equal(Object.hasOwn(livro, 'dimensoes'), false);
  assert.deepEqual(livro.fotos, []);
});

test('maps optional package columns to the existing dimensions schema', () => {
  const livro = normalizarLinhaImportacaoLivro({
    titulo: 'Livro com pacote',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25',
    pesoGramas: '450',
    alturaCm: '4',
    larguraCm: '15',
    comprimentoCm: '22',
    imagens: ''
  }, 2026);
  assert.deepEqual(livro.dimensoes, {
    peso: 450,
    altura: 4,
    largura: 15,
    comprimento: 22
  });
});

test('requires complete positive numeric package measurements', () => {
  const base = {
    titulo: 'Livro com pacote',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25'
  };
  assert.throws(
    () => normalizarLinhaImportacaoLivro({ ...base, pesoGramas: '450' }, 2026),
    /Campos faltantes: alturaCm, larguraCm, comprimentoCm/
  );
  for (const valor of ['0', '-1', '450 g', 'inválido']) {
    assert.throws(
      () => normalizarLinhaImportacaoLivro({
        ...base,
        pesoGramas: valor,
        alturaCm: '4',
        larguraCm: '15',
        comprimentoCm: '22'
      }, 2026),
      /pesoGramas/
    );
  }
});

test('normalizes one or multiple public HTTPS image URLs', () => {
  const base = {
    titulo: 'Livro com imagem',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25'
  };
  const capa = 'https://images.example.invalid/capa.jpg';
  const contracapa = 'https://images.example.invalid/contracapa.jpg';
  assert.deepEqual(
    normalizarLinhaImportacaoLivro({ ...base, imagens: ` ${capa} ` }, 2026).fotos,
    [capa]
  );
  assert.deepEqual(
    normalizarLinhaImportacaoLivro({
      ...base,
      imagens: ` ${capa} ; ${contracapa} `
    }, 2026).fotos,
    [capa, contracapa]
  );
});

test('rejects unsafe, non-HTTPS, oversized, and excessive image URLs', () => {
  const base = {
    titulo: 'Livro com imagem',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25'
  };
  for (const url of [
    'http://images.example.invalid/capa.jpg',
    'javascript:alert(1)',
    'https://usuario:senha@images.example.invalid/capa.jpg',
    `https://images.example.invalid/${'a'.repeat(2048)}.jpg`,
    'https://firebasestorage.googleapis.com/v0/b/demo/o/capa.jpg'
  ]) {
    assert.throws(
      () => normalizarLinhaImportacaoLivro({ ...base, imagens: url }, 2026),
      /imagens:/
    );
  }
  assert.throws(
    () => normalizarLinhaImportacaoLivro({
      ...base,
      imagens: Array.from({ length: 6 }, (_, index) =>
        `https://images.example.invalid/${index}.jpg`
      ).join(';')
    }, 2026),
    /imagens: Envie uma lista de até 5/
  );
});

test('passes imported photos and dimensions to the existing sebo persistence boundary', async () => {
  let persistencia;
  const criarLivroSebo = criarCriadorLivroSebo({
    buscarSebo: async () => ({
      nome: 'Sebo de teste',
      geocode: { type: 'Point', coordinates: [-46.63, -23.55] },
      localizacaoVersao: 1
    }),
    prepararLocalizacao: async () => {
      throw new Error('Não deve geocodificar um perfil já válido.');
    },
    persistir: async (dados) => {
      persistencia = dados;
      return { id: 'livro-teste' };
    },
    validarDadosNovoLivro: () => null
  });
  const livro = normalizarLinhaImportacaoLivro({
    titulo: 'Livro importado',
    autor: 'Uma Autora',
    localizacao: 'Estante A',
    preco: '25',
    pesoGramas: '450',
    alturaCm: '4',
    larguraCm: '15',
    comprimentoCm: '22',
    imagens: 'https://images.example.invalid/capa.jpg'
  }, 2026);

  await criarLivroSebo({ seboId: 'sebo-teste', dados: livro });
  assert.deepEqual(persistencia.dados.fotos, livro.fotos);
  assert.deepEqual(persistencia.dados.dimensoes, livro.dimensoes);
});

test('includes new fields and row errors in the downloadable report', async () => {
  const image = 'https://images.example.invalid/capa.jpg';
  const bytes = await criarRelatorioImportacaoLivros([{
    numeroLinha: 8,
    valores: {
      titulo: 'Livro com pacote',
      pesoGramas: '450',
      alturaCm: '4',
      larguraCm: '15',
      comprimentoCm: '22',
      imagens: image
    },
    erro: 'imagens: URL inválida.'
  }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  const sheet = workbook.getWorksheet('Resultado');
  const colunas = new Map(sheet.getRow(1).values.slice(1).map((nome, index) => [nome, index + 1]));
  assert.equal(sheet.getCell(2, colunas.get('linhaPlanilha')).value, 8);
  assert.equal(sheet.getCell(2, colunas.get('pesoGramas')).value, '450');
  assert.equal(sheet.getCell(2, colunas.get('imagens')).value, image);
  assert.equal(sheet.getCell(2, colunas.get('erro')).value, 'imagens: URL inválida.');
});

test('counts populated books instead of formatted worksheet rows', async () => {
  const workbookBytes = await criarPlanilhaComLivros(15, { linhaFormatada: 1000 });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBytes);
  assert.equal(workbook.getWorksheet('Livros').rowCount, 1000);

  const rows = await lerPlanilhaImportacaoLivros(workbookBytes);
  assert.equal(rows.length, 15);
  assert.deepEqual(rows.map((row) => row.numeroLinha), Array.from({ length: 15 }, (_, i) => i + 2));
});

test('accepts exactly 100 populated books and rejects 101', async () => {
  const hundredRows = await lerPlanilhaImportacaoLivros(await criarPlanilhaComLivros(100));
  assert.equal(hundredRows.length, 100);

  await assert.rejects(
    lerPlanilhaImportacaoLivros(await criarPlanilhaComLivros(101)),
    /no máximo 100 livros/
  );
});

test('ignores formatted blank rows and preserves line numbers for partial rows', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Livros');
  sheet.addRow(COLUNAS_IMPORTACAO_LIVROS);
  sheet.getRow(2).getCell(26).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' }
  };
  sheet.getRow(3).getCell(1).value = 'Livro incompleto';
  sheet.addRow([
    'Livro válido',
    'Uma Autora',
    '',
    '',
    '',
    '',
    '',
    '',
    'venda',
    25,
    'Estante A',
    1
  ]);

  const rows = await lerPlanilhaImportacaoLivros(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(rows.map((row) => row.numeroLinha), [3, 4]);
  assert.throws(
    () => normalizarLinhaImportacaoLivro(rows[0].valores, 2026),
    /Preencha a coluna autor/
  );
});

test('rejects missing required headers and retains invalid data rows', async () => {
  const workbookWithoutHeader = new ExcelJS.Workbook();
  const sheetWithoutHeader = workbookWithoutHeader.addWorksheet('Livros');
  sheetWithoutHeader.addRow(COLUNAS_IMPORTACAO_LIVROS.map(
    (column) => column === 'localizacao' ? 'endereco' : column
  ));
  await assert.rejects(
    lerPlanilhaImportacaoLivros(Buffer.from(await workbookWithoutHeader.xlsx.writeBuffer())),
    /Cabeçalhos obrigatórios ausentes: localizacao/
  );

  const invalidBook = await criarPlanilhaComLivros(1);
  const workbookWithInvalidBook = new ExcelJS.Workbook();
  await workbookWithInvalidBook.xlsx.load(invalidBook);
  workbookWithInvalidBook.getWorksheet('Livros').getRow(2).getCell(5).value = 1499;
  const rows = await lerPlanilhaImportacaoLivros(
    Buffer.from(await workbookWithInvalidBook.xlsx.writeBuffer())
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].numeroLinha, 2);
  assert.throws(
    () => normalizarLinhaImportacaoLivro(rows[0].valores, 2026),
    /anoPublicacao/
  );
});

test('reads spreadsheet rows and reports formula cells as invalid', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Livros');
  sheet.addRow(COLUNAS_IMPORTACAO_LIVROS);
  const linha = sheet.addRow([
    '',
    'Uma Autora',
    '',
    '',
    '',
    '',
    '',
    '',
    'venda',
    25,
    'Estante A',
    1
  ]);
  linha.getCell(1).value = { formula: '1+1', result: '2' };
  const linhas = await lerPlanilhaImportacaoLivros(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.match(linhas[0].erro, /Fórmulas não são aceitas/);
});

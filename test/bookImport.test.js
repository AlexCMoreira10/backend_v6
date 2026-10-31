import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  COLUNAS_IMPORTACAO_LIVROS,
  criarModeloImportacaoLivros,
  lerPlanilhaImportacaoLivros,
  normalizarLinhaImportacaoLivro
} from '../src/utils/bookImport.js';

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

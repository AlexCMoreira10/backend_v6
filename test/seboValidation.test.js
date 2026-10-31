import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarCnpj,
  validarCadastroSebo,
  validarCnpj
} from '../src/utils/seboValidation.js';

const dadosValidos = () => ({
  nome: 'Sebo Fatec',
  email: 'sebo@email.com',
  cnpj: '20.182.807/0004-42',
  telefone: ['(11) 99999-9999'],
  endereco: {
    rua: 'Rua das Letras',
    numero: 5,
    complemento: '',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01001-000'
  },
  horario_funcionamento: {
    segunda: { abre: '08:00', fecha: '18:00' },
    terca: { abre: '08:00', fecha: '18:00' },
    quarta: { abre: '08:00', fecha: '18:00' },
    quinta: { abre: '08:00', fecha: '18:00' },
    sexta: { abre: '08:00', fecha: '18:00' },
    sabado: null,
    domingo: null
  }
});

test('validates and formats a numeric CNPJ', () => {
  assert.equal(validarCnpj('20.182.807/0004-42'), true);
  assert.equal(formatarCnpj('20182807000442'), '20.182.807/0004-42');
});

test('validates the alphanumeric CNPJ format', () => {
  assert.equal(validarCnpj('12.ABC.345/01DE-35'), true);
  assert.equal(formatarCnpj('12ABC34501DE35'), '12.ABC.345/01DE-35');
});

test('rejects a CNPJ with invalid check digits and repeated digits', () => {
  assert.equal(validarCnpj('20.182.807/0004-41'), false);
  assert.equal(validarCnpj('00.000.000/0000-00'), false);
});

test('validates a full sebo profile for the authenticated email', () => {
  const resultado = validarCadastroSebo(dadosValidos(), 'sebo@email.com');
  assert.equal(resultado.erro, undefined);
  assert.equal(resultado.sebo.cnpj, '20.182.807/0004-42');
  assert.equal(resultado.sebo.endereco.cep, '01001-000');
  assert.equal(resultado.sebo.horario_funcionamento.domingo, null);
});

test('rejects a profile whose email differs from the authenticated account', () => {
  const resultado = validarCadastroSebo(dadosValidos(), 'outra@email.com');
  assert.match(resultado.erro, /corresponder à conta autenticada/);
});

test('rejects an invalid schedule or a schedule with no open days', () => {
  const semDiasAbertos = dadosValidos();
  Object.keys(semDiasAbertos.horario_funcionamento)
    .forEach((dia) => { semDiasAbertos.horario_funcionamento[dia] = null; });
  assert.match(
    validarCadastroSebo(semDiasAbertos, 'sebo@email.com').erro,
    /horários válidos/
  );

  const horarioInvalido = dadosValidos();
  horarioInvalido.horario_funcionamento.segunda.fecha = '07:00';
  assert.match(
    validarCadastroSebo(horarioInvalido, 'sebo@email.com').erro,
    /horários válidos/
  );
});

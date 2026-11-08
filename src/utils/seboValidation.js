const DIAS_SEMANA = [
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
  'domingo'
];

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIO_VALIDO = /^([01]\d|2[0-3]):[0-5]\d$/;

export const normalizarCnpj = (cnpj) => String(cnpj ?? '')
  .replace(/[./\-\s]/g, '')
  .toUpperCase();

export const validarCnpj = (cnpj) => {
  const normalizado = normalizarCnpj(cnpj);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(normalizado)) return false;
  if (/^(.)\1+$/.test(normalizado)) return false;

  const calcularDigito = (base, pesos) => {
    const soma = [...base].reduce(
      (total, caractere, indice) =>
        total + (caractere.charCodeAt(0) - 48) * pesos[indice],
      0
    );
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiroDigito = calcularDigito(normalizado.slice(0, 12), [
    5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2
  ]);
  const segundoDigito = calcularDigito(normalizado.slice(0, 12) + primeiroDigito, [
    6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2
  ]);

  return normalizado.endsWith(`${primeiroDigito}${segundoDigito}`);
};

const validarEndereco = (endereco) => {
  if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) {
    return false;
  }

  const textoObrigatorio = ['rua', 'bairro', 'cidade', 'estado', 'cep'];
  const camposValidos = textoObrigatorio.every(
    (campo) => typeof endereco[campo] === 'string' && endereco[campo].trim()
  );
  const numeroValido = (
    (typeof endereco.numero === 'string' && endereco.numero.trim()) ||
    (typeof endereco.numero === 'number' && Number.isFinite(endereco.numero))
  );

  return camposValidos &&
    numeroValido &&
    /^[A-Z]{2}$/i.test(endereco.estado.trim()) &&
    /^\d{5}-?\d{3}$/.test(endereco.cep.trim()) &&
    (endereco.complemento === undefined || typeof endereco.complemento === 'string');
};

const validarHorario = (horario) => {
  if (!horario || typeof horario !== 'object' || Array.isArray(horario)) {
    return false;
  }

  const diasRecebidos = Object.keys(horario);
  if (DIAS_SEMANA.some((dia) => !diasRecebidos.includes(dia))) return false;

  let algumDiaAberto = false;
  for (const dia of DIAS_SEMANA) {
    const periodo = horario[dia];
    if (periodo === null) continue;

    if (
      !periodo ||
      typeof periodo !== 'object' ||
      !HORARIO_VALIDO.test(periodo.abre) ||
      !HORARIO_VALIDO.test(periodo.fecha) ||
      periodo.abre >= periodo.fecha
    ) {
      return false;
    }

    algumDiaAberto = true;
  }

  return algumDiaAberto;
};

export const formatarCnpj = (cnpj) => {
  const normalizado = normalizarCnpj(cnpj);
  return normalizado.replace(
    /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
};

export const validarCadastroSebo = (body = {}, emailAutenticado) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const {
    nome,
    email,
    cnpj,
    telefone,
    endereco,
    horario_funcionamento
  } = body;

  if (typeof nome !== 'string' || !nome.trim()) {
    return { erro: 'O nome do sebo é obrigatório' };
  }

  if (
    typeof email !== 'string' ||
    !EMAIL_VALIDO.test(email.trim()) ||
    typeof emailAutenticado !== 'string' ||
    email.trim().toLowerCase() !== emailAutenticado.toLowerCase()
  ) {
    return { erro: 'O e-mail deve ser válido e corresponder à conta autenticada' };
  }

  if (!validarCnpj(cnpj)) {
    return { erro: 'Informe um CNPJ válido' };
  }

  if (
    !Array.isArray(telefone) ||
    telefone.length === 0 ||
    telefone.some((numero) => (
      typeof numero !== 'string' ||
      !numero.trim() ||
      !/^[+\d\s().-]+$/.test(numero.trim()) ||
      ![10, 11].includes(numero.replace(/\D/g, '').length)
    ))
  ) {
    return { erro: 'Informe ao menos um telefone válido com DDD' };
  }

  if (!validarEndereco(endereco)) {
    return { erro: 'Informe um endereço completo e válido' };
  }

  if (!validarHorario(horario_funcionamento)) {
    return {
      erro: 'Informe horários válidos para os sete dias e mantenha ao menos um dia aberto'
    };
  }

  const sebo = {
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    cnpj: formatarCnpj(cnpj),
    telefone: telefone.map((numero) => numero.trim()),
    endereco: {
      rua: endereco.rua.trim(),
      numero: typeof endereco.numero === 'string' ? endereco.numero.trim() : endereco.numero,
      complemento: typeof endereco.complemento === 'string' ? endereco.complemento.trim() : '',
      bairro: endereco.bairro.trim(),
      cidade: endereco.cidade.trim(),
      estado: endereco.estado.trim().toUpperCase(),
      cep: endereco.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
    },
    horario_funcionamento: Object.fromEntries(
      DIAS_SEMANA.map((dia) => [
        dia,
        horario_funcionamento[dia] === null
          ? null
          : {
            abre: horario_funcionamento[dia].abre,
            fecha: horario_funcionamento[dia].fecha
          }
      ])
    )
  };

  return { sebo };
};

export const validarAtualizacaoSebo = (body = {}, perfilAtual) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const camposPermitidos = new Set(['nome', 'telefone', 'endereco', 'horario_funcionamento']);
  const campoInvalido = Object.keys(body).find(campo => !camposPermitidos.has(campo));
  if (campoInvalido) return { erro: `Campo não permitido: ${campoInvalido}` };
  if (Object.keys(body).length === 0) return { erro: 'Informe ao menos um campo para atualizar' };

  const resultado = validarCadastroSebo({
    nome: Object.hasOwn(body, 'nome') ? body.nome : perfilAtual.nome,
    email: perfilAtual.email,
    cnpj: perfilAtual.cnpj,
    telefone: Object.hasOwn(body, 'telefone') ? body.telefone : perfilAtual.telefone,
    endereco: Object.hasOwn(body, 'endereco') ? body.endereco : perfilAtual.endereco,
    horario_funcionamento: Object.hasOwn(body, 'horario_funcionamento')
      ? body.horario_funcionamento
      : perfilAtual.horario_funcionamento
  }, perfilAtual.email);
  if (resultado.erro) return resultado;

  const atualizacao = {};
  for (const campo of Object.keys(body)) {
    atualizacao[campo] = resultado.sebo[campo];
  }
  return { atualizacao };
};

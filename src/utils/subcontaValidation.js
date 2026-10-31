export const PAPEIS_SUBCONTA = {
  cadastrador_acervo: [
    'acervo.consultar',
    'acervo.cadastrar',
    'acervo.editar',
    'acervo.excluir'
  ],
  operador_negociacoes: [
    'negociacoes.consultar',
    'negociacoes.gerenciar'
  ],
  gestor_financeiro: [
    'financeiro.consultar',
    'financeiro.relatorios'
  ],
  personalizado: []
};

export const PERMISSOES_SUBCONTA = new Set(
  Object.values(PAPEIS_SUBCONTA).flat()
);

export const normalizarLogin = (login) => String(login ?? '').trim().toLowerCase();

export const normalizarTelefone = (telefone) => String(telefone ?? '').replace(/\D/g, '');

export const normalizarCpf = (cpf) => String(cpf ?? '').replace(/\D/g, '');

export const validarCpf = (cpf) => {
  const numero = normalizarCpf(cpf);
  if (!/^\d{11}$/.test(numero) || /^(\d)\1{10}$/.test(numero)) return false;

  const calcularDigito = (base, pesoInicial) => {
    let soma = 0;
    for (let indice = 0; indice < base.length; indice += 1) {
      soma += Number(base[indice]) * (pesoInicial - indice);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiroDigito = calcularDigito(numero.slice(0, 9), 10);
  const segundoDigito = calcularDigito(numero.slice(0, 10), 11);
  return numero.endsWith(`${primeiroDigito}${segundoDigito}`);
};

export const formatarCpf = (cpf) => normalizarCpf(cpf)
  .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

const validarPermissoes = (permissoes) => Array.isArray(permissoes) &&
  permissoes.every((permissao) => PERMISSOES_SUBCONTA.has(permissao)) &&
  new Set(permissoes).size === permissoes.length;

export const validarDadosSubconta = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const login = normalizarLogin(body.login);
  const cpf = normalizarCpf(body.cpf);
  const telefone = normalizarTelefone(body.telefone);
  const tipo = body.tipo;

  if (nome.length < 2 || nome.length > 120) {
    return { erro: 'Informe o nome do colaborador (2 a 120 caracteres)' };
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)) {
    return { erro: 'O login deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado' };
  }
  if (!validarCpf(cpf)) {
    return { erro: 'Informe um CPF válido' };
  }
  if (
    body.telefone &&
    (!/^\+?[\d\s().-]+$/.test(String(body.telefone).trim()) ||
      ![10, 11].includes(telefone.length))
  ) {
    return { erro: 'O telefone deve conter DDD e 10 ou 11 dígitos' };
  }
  if (telefone && telefone === login) {
    return { erro: 'O login e o telefone precisam ser diferentes' };
  }
  if (!Object.hasOwn(PAPEIS_SUBCONTA, tipo)) {
    return { erro: 'Selecione um tipo de subconta válido' };
  }

  const permissoes = body.permissoes ?? PAPEIS_SUBCONTA[tipo];
  if (!validarPermissoes(permissoes)) {
    return { erro: 'A lista de permissões contém operações inválidas ou repetidas' };
  }

  const senhaTemporaria = body.senhaTemporaria;
  if (
    typeof senhaTemporaria !== 'string' ||
    senhaTemporaria.length < 10 ||
    senhaTemporaria.length > 128
  ) {
    return { erro: 'A senha temporária deve ter entre 10 e 128 caracteres' };
  }

  return {
    subconta: {
      nome,
      login,
      telefone: telefone || null,
      cpf,
      tipo,
      permissoes: [...permissoes],
      senhaTemporaria
    }
  };
};

export const validarAtualizacaoSubconta = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const atualizacao = {};
  if (body.nome !== undefined) {
    if (typeof body.nome !== 'string' || body.nome.trim().length < 2 || body.nome.trim().length > 120) {
      return { erro: 'O nome deve ter de 2 a 120 caracteres' };
    }
    atualizacao.nome = body.nome.trim();
  }

  if (body.login !== undefined) {
    const login = normalizarLogin(body.login);
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)) {
      return { erro: 'O login deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado' };
    }
    atualizacao.login = login;
  }

  if (body.telefone !== undefined) {
    const telefone = normalizarTelefone(body.telefone);
    if (
      body.telefone &&
      (!/^\+?[\d\s().-]+$/.test(String(body.telefone).trim()) ||
        ![10, 11].includes(telefone.length))
    ) {
      return { erro: 'O telefone deve conter DDD e 10 ou 11 dígitos' };
    }
    atualizacao.telefone = telefone || null;
  }

  if (body.tipo !== undefined) {
    if (!Object.hasOwn(PAPEIS_SUBCONTA, body.tipo)) {
      return { erro: 'Selecione um tipo de subconta válido' };
    }
    atualizacao.tipo = body.tipo;
    if (body.permissoes === undefined) {
      atualizacao.permissoes = [...PAPEIS_SUBCONTA[body.tipo]];
    }
  }

  if (body.permissoes !== undefined) {
    if (!validarPermissoes(body.permissoes)) {
      return { erro: 'A lista de permissões contém operações inválidas ou repetidas' };
    }
    atualizacao.permissoes = [...body.permissoes];
  }

  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') return { erro: 'O estado ativo deve ser booleano' };
    atualizacao.ativo = body.ativo;
  }

  if (Object.keys(atualizacao).length === 0) {
    return { erro: 'Informe pelo menos um campo para atualizar' };
  }

  return { atualizacao };
};

export const validarSenhaTemporaria = (senha) => typeof senha === 'string' &&
  senha.length >= 10 &&
  senha.length <= 128;

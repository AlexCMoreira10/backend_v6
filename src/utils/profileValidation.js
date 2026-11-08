const CAMPOS_PERFIL = new Set(['nome', 'telefone', 'data_nascimento', 'endereco', 'geocode']);
const CAMPOS_ENDERECO = new Set([
  'rua',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'estado',
  'cep'
]);

const validarEnderecoPerfil = (endereco) => {
  if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) {
    return false;
  }

  return Object.entries(endereco).every(([campo, valor]) =>
    CAMPOS_ENDERECO.has(campo) &&
    (campo === 'numero'
      ? typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor))
      : typeof valor === 'string')
  );
};

const validarGeocodePerfil = (geocode) => {
  if (geocode === null) return true;
  if (!geocode || typeof geocode !== 'object' || Array.isArray(geocode)) return false;

  const { type, coordinates } = geocode;
  return type === 'Point' &&
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(coordinates[0]) &&
    coordinates[0] >= -180 &&
    coordinates[0] <= 180 &&
    Number.isFinite(coordinates[1]) &&
    coordinates[1] >= -90 &&
    coordinates[1] <= 90;
};

export const validarAtualizacaoPerfil = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const camposImutaveis = ['id', '_id', 'uid', 'email'];
  if (camposImutaveis.some((campo) => Object.hasOwn(body, campo))) {
    return { erro: 'O ID e o e-mail não podem ser alterados' };
  }

  const campoDesconhecido = Object.keys(body).find((campo) => !CAMPOS_PERFIL.has(campo));
  if (campoDesconhecido) {
    return { erro: `O campo "${campoDesconhecido}" não pode ser atualizado` };
  }

  const { nome, telefone, data_nascimento: dataNascimento, endereco, geocode } = body;
  if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 120) {
    return { erro: 'Informe um nome completo com até 120 caracteres' };
  }

  if (
    !Array.isArray(telefone) ||
    telefone.length === 0 ||
    telefone.some((numero) => typeof numero !== 'string' || !numero.trim())
  ) {
    return { erro: 'Informe ao menos um telefone válido' };
  }

  if (
    typeof dataNascimento !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento) ||
    Number.isNaN(Date.parse(`${dataNascimento}T00:00:00.000Z`)) ||
    new Date(`${dataNascimento}T00:00:00.000Z`).toISOString().slice(0, 10) !== dataNascimento ||
    new Date(`${dataNascimento}T00:00:00.000Z`).getTime() > Date.now()
  ) {
    return { erro: 'Informe uma data de nascimento válida' };
  }

  if (endereco !== undefined && !validarEnderecoPerfil(endereco)) {
    return { erro: 'O endereço deve conter apenas campos válidos em formato de texto' };
  }

  if (geocode !== undefined && !validarGeocodePerfil(geocode)) {
    return {
      erro: 'A localização deve ser um GeoJSON Point com longitude e latitude válidas'
    };
  }

  const atualizacao = {
    nome: nome.trim(),
    telefone: telefone.map((numero) => numero.trim()),
    data_nascimento: new Date(`${dataNascimento}T00:00:00.000Z`)
  };
  if (endereco !== undefined) atualizacao.endereco = endereco;
  if (geocode !== undefined) atualizacao.geocode = geocode;

  return { atualizacao };
};

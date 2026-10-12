import {
  cadastrarUsuario as cadastrarUsuarioService,
  salvarUsuarioSeNaoExistir
} from '../services/userService.js';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validarEndereco = (endereco) => {
  if (endereco === undefined) return true;
  if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) {
    return false;
  }

  const camposTexto = ['rua', 'complemento', 'bairro', 'cidade', 'estado', 'cep'];
  const camposInvalidos = camposTexto.some(
    (campo) => endereco[campo] !== undefined && typeof endereco[campo] !== 'string'
  );
  const numeroValido = endereco.numero === undefined ||
    (typeof endereco.numero === 'string' && endereco.numero.trim()) ||
    (typeof endereco.numero === 'number' && Number.isFinite(endereco.numero));

  return !camposInvalidos && Boolean(numeroValido);
};

const validarGeocode = (geocode) => {
  if (geocode === undefined) return true;
  if (!geocode || typeof geocode !== 'object' || Array.isArray(geocode)) {
    return false;
  }

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

const prepararDadosCadastro = (body = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { erro: 'O body deve ser um objeto JSON' };
  }

  const {
    nome,
    email,
    senha,
    telefone,
    data_nascimento,
    endereco,
    geocode: geocodeInformado,
    geoJson
  } = body;
  const geocode = geocodeInformado ?? geoJson;

  if (typeof nome !== 'string' || !nome.trim()) {
    return { erro: 'Nome completo é obrigatório' };
  }

  if (typeof email !== 'string' || !EMAIL_VALIDO.test(email.trim())) {
    return { erro: 'Informe um endereço de e-mail válido' };
  }

  if (typeof senha !== 'string' || senha.length < 8) {
    return { erro: 'A senha deve ter pelo menos 8 caracteres' };
  }

  if (
    !Array.isArray(telefone) ||
    telefone.length === 0 ||
    telefone.some((numero) => typeof numero !== 'string' || !numero.trim())
  ) {
    return { erro: 'Informe ao menos um telefone válido' };
  }

  const dataNascimento = new Date(data_nascimento);
  if (
    typeof data_nascimento !== 'string' ||
    !data_nascimento.trim() ||
    Number.isNaN(dataNascimento.getTime()) ||
    dataNascimento.getTime() > Date.now()
  ) {
    return { erro: 'Informe uma data de nascimento válida' };
  }

  if (!validarEndereco(endereco)) {
    return { erro: 'O endereço deve ser um objeto válido' };
  }

  if (!validarGeocode(geocode)) {
    return {
      erro: 'A geolocalização deve ser um GeoJSON Point com coordenadas [longitude, latitude] válidas'
    };
  }

  const usuario = {
    nome: nome.trim(),
    email: email.trim().toLowerCase(),
    senha,
    telefone: telefone.map((numero) => numero.trim()),
    data_nascimento: dataNascimento
  };

  if (endereco !== undefined) {
    usuario.endereco = endereco;
  }

  if (geocode !== undefined) {
    usuario.geocode = geocode;
  }

  return { usuario };
};

export const cadastrarUsuario = async (req, res) => {
  const { usuario, erro } = prepararDadosCadastro(req.body);

  if (erro) {
    return res.status(400).json({ erro });
  }

  try {
    const resultado = await cadastrarUsuarioService(usuario);
    return res.status(201).json(resultado);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado' });
    }

    console.error(error);
    return res.status(500).json({ erro: 'Erro ao cadastrar usuário' });
  }
};

export const criarOuBuscarUsuario = async (req, res) => {
  try {
    const usuario = {
      uid: req.usuario.uid,
      nome: req.usuario.name || '',
      email: req.usuario.email || '',
      foto: req.usuario.picture || '',
      criadoEm: new Date()
    };

    const resultado = await salvarUsuarioSeNaoExistir(usuario);

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao salvar usuário' });
  }
};
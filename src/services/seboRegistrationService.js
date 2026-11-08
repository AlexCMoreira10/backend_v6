import { copiarGeocodeSebo, geocodeSeboValido } from '../utils/seboGeocode.js';
import { normalizarCnpj } from '../utils/seboValidation.js';

const criarErro = (code, status, message) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
};

export const criarCadastradorSebo = ({
  db,
  geocodificarEndereco,
  now = () => new Date(),
  logger = console
}) => async (uid, dadosSebo) => {
  const seboRef = db.collection('sebos').doc(uid);
  const cnpjRef = db.collection('sebos_cnpj').doc(normalizarCnpj(dadosSebo.cnpj));
  const [seboExistente, cnpjExistente] = await Promise.all([
    seboRef.get(),
    cnpjRef.get()
  ]);
  if (seboExistente.exists) {
    throw criarErro(
      'sebo/already-exists',
      409,
      'Já existe um cadastro de sebo para esta conta'
    );
  }
  if (cnpjExistente.exists) {
    throw criarErro('sebo/cnpj-already-exists', 409, 'Este CNPJ já está cadastrado');
  }

  let geocode;
  let resultado;
  try {
    resultado = await geocodificarEndereco(dadosSebo.endereco);
  } catch (error) {
    logger.error('Falha ao geocodificar o endereço comercial do sebo:', error);
    throw criarErro(
      'sebo/geocoding-unavailable',
      502,
      'O serviço de geocodificação está indisponível. Tente novamente mais tarde.'
    );
  }
  if (!geocodeSeboValido(resultado?.geocode)) {
    throw criarErro(
      'sebo/geocoding-unconfirmed',
      422,
      resultado?.aviso ||
        'Não foi possível confirmar a localização do endereço comercial. Confira o endereço e tente novamente.'
    );
  }
  geocode = copiarGeocodeSebo(resultado.geocode);

  const criadoEm = now();

  return db.runTransaction(async transaction => {
    const [seboDoc, cnpjDoc] = await Promise.all([
      transaction.get(seboRef),
      transaction.get(cnpjRef)
    ]);

    if (seboDoc.exists) {
      throw criarErro(
        'sebo/already-exists',
        409,
        'Já existe um cadastro de sebo para esta conta'
      );
    }

    if (cnpjDoc.exists) {
      throw criarErro('sebo/cnpj-already-exists', 409, 'Este CNPJ já está cadastrado');
    }

    const sebo = {
      _id: uid,
      uid,
      ...dadosSebo,
      geocode,
      localizacaoVersao: 1,
      localizacaoSyncStatus: 'sincronizado',
      criadoEm
    };

    transaction.set(seboRef, sebo);
    transaction.set(cnpjRef, { uid, criadoEm });
    return { id: uid, ...sebo };
  });
};

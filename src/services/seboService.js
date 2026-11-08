import admin, { db } from '../config/firebase.js';
import { geocodificarEndereco } from './geocodingService.js';
import { criarAtualizadorSebo } from './seboProfileService.js';
import { criarSincronizadorLocalizacaoSebo } from './seboLocationSyncService.js';
import { criarCadastradorSebo } from './seboRegistrationService.js';
import { geocodeSeboValido } from '../utils/seboGeocode.js';

const sebos = db.collection('sebos');
const sincronizarLocalizacao = criarSincronizadorLocalizacaoSebo({
  db,
  deleteField: () => admin.firestore.FieldValue.delete(),
  documentIdFieldPath: admin.firestore.FieldPath.documentId(),
  geocodificarEndereco
});
const atualizarPerfil = criarAtualizadorSebo({
  db,
  deleteField: () => admin.firestore.FieldValue.delete(),
  sincronizarLocalizacao
});

export const cadastrarSebo = criarCadastradorSebo({ db, geocodificarEndereco });

export const buscarSeboPorId = async (uid) => {
  const doc = await sebos.doc(uid).get();
  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};

export const sincronizarLocalizacaoSebo = sincronizarLocalizacao;
export const atualizarSebo = atualizarPerfil;

export const prepararLocalizacaoSebo = async uid => {
  let sebo = await buscarSeboPorId(uid);
  if (!sebo || geocodeSeboValido(sebo.geocode)) return sebo;

  await sincronizarLocalizacao(uid);
  sebo = await buscarSeboPorId(uid);
  if (!sebo || !geocodeSeboValido(sebo.geocode)) {
    const error = new Error(
      'Não foi possível confirmar a localização comercial deste sebo. Confira o endereço antes de cadastrar livros.'
    );
    error.status = 422;
    throw error;
  }
  return sebo;
};

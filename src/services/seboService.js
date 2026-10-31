import { db } from '../config/firebase.js';
import { normalizarCnpj } from '../utils/seboValidation.js';

const sebos = db.collection('sebos');
const cnpjs = db.collection('sebos_cnpj');

export const cadastrarSebo = async (uid, dadosSebo) => {
  const seboRef = sebos.doc(uid);
  const cnpjRef = cnpjs.doc(normalizarCnpj(dadosSebo.cnpj));

  return db.runTransaction(async (transaction) => {
    const [seboDoc, cnpjDoc] = await Promise.all([
      transaction.get(seboRef),
      transaction.get(cnpjRef)
    ]);

    if (seboDoc.exists) {
      const error = new Error('Já existe um cadastro de sebo para esta conta');
      error.code = 'sebo/already-exists';
      throw error;
    }

    if (cnpjDoc.exists) {
      const error = new Error('Este CNPJ já está cadastrado');
      error.code = 'sebo/cnpj-already-exists';
      throw error;
    }

    const sebo = {
      _id: uid,
      uid,
      ...dadosSebo,
      criadoEm: new Date()
    };

    transaction.set(seboRef, sebo);
    transaction.set(cnpjRef, { uid, criadoEm: new Date() });
    return { id: uid, ...sebo };
  });
};

export const buscarSeboPorId = async (uid) => {
  const doc = await sebos.doc(uid).get();
  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};

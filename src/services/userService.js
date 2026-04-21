import { db } from '../config/firebase.js';

const collection = db.collection('users');

export const salvarUsuarioSeNaoExistir = async (usuario) => {
  const docRef = collection.doc(usuario.uid);
  const doc = await docRef.get();

  if (!doc.exists) {
    await docRef.set(usuario);
  }

  return usuario;
};
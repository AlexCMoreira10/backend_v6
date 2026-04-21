import { db } from '../config/firebase.js';

const collection = db.collection('notificacoes');

export const criarNotificacao = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
  };
};

export const listarNotificacoes = async (usuarioId) => {
  const snapshot = await collection
    .where('usuarioId', '==', usuarioId)
    .orderBy('criadoEm', 'desc')
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

export const marcarComoLida = async (id) => {
  await collection.doc(id).update({ lida: true });
};

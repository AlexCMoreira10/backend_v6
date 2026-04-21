import { db } from '../config/firebase.js';

const collection = db.collection('trocas');

export const criarTroca = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
  };
};

export const buscarTrocaPorId = async (id) => {
  const doc = await collection.doc(id).get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};

export const atualizarTroca = async (id, dados) => {
  await collection.doc(id).update(dados);
};

export const listarTrocasPorUsuario = async (usuarioId) => {
  // 📥 Trocas recebidas
  const recebidasSnapshot = await collection
    .where('destinatarioId', '==', usuarioId)
    .orderBy('criadoEm', 'desc')
    .get();

  const recebidas = recebidasSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // 📤 Trocas enviadas
  const enviadasSnapshot = await collection
    .where('solicitanteId', '==', usuarioId)
    .orderBy('criadoEm', 'desc')
    .get();

  const enviadas = enviadasSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return {
    recebidas,
    enviadas
  };
};
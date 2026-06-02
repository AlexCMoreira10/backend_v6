import { db } from '../config/firebase.js';

const collection = db.collection('mensagens');

export const criarMensagem = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
  };
};

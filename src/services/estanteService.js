import { db } from '../config/firebase.js';

export const estante = db.collection('estante');

export const formatarItemEstante = (livroId, livro) => {
  const { qrToken, transferenciaPendente, ...dados } = livro;
  return {
    ...dados,
    id: livroId,
    livroId
  };
};

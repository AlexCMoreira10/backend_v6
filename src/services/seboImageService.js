import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { extensaoImagemValida } from '../utils/bookImageValidation.js';

const bucketName = process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
const bucket = getStorage().bucket(bucketName);

export const salvarImagemLivro = async ({ seboId, contentType, conteudo }) => {
  const extensao = extensaoImagemValida(contentType, conteudo);
  if (!extensao) {
    const erro = new Error('Formato de imagem não permitido');
    erro.status = 415;
    throw erro;
  }

  const path = `sebos/${seboId}/livros/${randomUUID()}.${extensao}`;
  const token = randomUUID();
  await bucket.file(path).save(conteudo, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token
      }
    }
  });

  return {
    path,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
  };
};

export const removerImagensLivro = async ({ seboId, paths }) => {
  const prefixo = `sebos/${seboId}/livros/`;
  const padraoNome = /^[0-9a-f-]+\.(?:jpg|png|webp)$/;
  if (paths.some((path) =>
    typeof path !== 'string' ||
    !path.startsWith(prefixo) ||
    !padraoNome.test(path.slice(prefixo.length))
  )) {
    const erro = new Error('Uma ou mais imagens não pertencem a este sebo');
    erro.status = 400;
    throw erro;
  }

  await Promise.all(paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
};

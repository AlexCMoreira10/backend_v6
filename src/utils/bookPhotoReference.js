import { validarUrlsFotos } from './bookPhotoUrls.js';

export const ehHostFirebaseStorage = (hostname) =>
  hostname === 'firebasestorage.googleapis.com' ||
  hostname === 'storage.googleapis.com' ||
  hostname.endsWith('.firebasestorage.app');

export const extrairPathObjetoStorage = (valor, bucketNome) => {
  let url;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }

  const prefixo = `/v0/b/${bucketNome}/o/`;
  if (url.protocol !== 'https:' ||
      url.hostname !== 'firebasestorage.googleapis.com' ||
      !url.pathname.startsWith(prefixo)) {
    return null;
  }

  try {
    return decodeURIComponent(url.pathname.slice(prefixo.length));
  } catch {
    return null;
  }
};

export const validarUrlsExternasLivro = (fotos, bucketNome) => {
  if (!Array.isArray(fotos)) return 'Envie uma lista de URLs de imagens';
  const erro = validarUrlsFotos(fotos);
  if (erro) return erro;
  if (fotos.some((foto) => {
    let url;
    try {
      url = new URL(foto);
    } catch {
      return true;
    }
    return ehHostFirebaseStorage(url.hostname) ||
      url.hostname === bucketNome;
  })) {
    return 'Imagens do Firebase Storage devem ser enviadas nesta operação';
  }
  return null;
};

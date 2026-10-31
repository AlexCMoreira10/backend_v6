export const validarUrlsFotos = (fotos) => {
  if (fotos === undefined) return null;
  if (!Array.isArray(fotos) || fotos.length > 5) {
    return 'Envie uma lista de até 5 URLs de imagens';
  }
  for (const foto of fotos) {
    if (typeof foto !== 'string') return 'Cada imagem deve ser informada por URL HTTPS';
    let url;
    try {
      url = new URL(foto);
    } catch {
      return 'Cada imagem deve ser informada por uma URL HTTPS válida';
    }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return 'Cada imagem deve ser informada por uma URL HTTPS válida, sem usuário ou senha';
    }
  }
  return null;
};

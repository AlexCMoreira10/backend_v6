const signaturesByType = {
  'image/jpeg': (content) => content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff,
  'image/png': (content) => content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (content) => content.length >= 12 &&
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP'
};

export const extensaoImagemValida = (contentType, content) => {
  const extensoes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const validarAssinatura = signaturesByType[contentType];
  return validarAssinatura?.(content) ? extensoes[contentType] : null;
};

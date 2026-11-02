import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const obterChave = () => {
  const valor = process.env.MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY;
  if (!valor) {
    throw new Error('Defina MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY para proteger os tokens do Melhor Envio.');
  }

  const chave = Buffer.from(valor, 'base64');
  if (chave.length !== 32) {
    throw new Error('MELHOR_ENVIO_TOKEN_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes.');
  }
  return createHmac('sha256', chave).update('estante-babel:melhor-envio-token:v1').digest();
};

export const criptografarTokensMelhorEnvio = (tokens) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', obterChave(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), 'utf8'),
    cipher.final()
  ]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
};

export const descriptografarTokensMelhorEnvio = (dados) => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    obterChave(),
    Buffer.from(dados.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(dados.tag, 'base64'));
  const texto = Buffer.concat([
    decipher.update(Buffer.from(dados.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(texto);
};

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const chaveMestre = () => {
  const valor = process.env.SUBACCOUNT_ENCRYPTION_KEY;
  if (!valor) {
    throw new Error('Defina SUBACCOUNT_ENCRYPTION_KEY para proteger CPFs de colaboradores.');
  }

  const chave = Buffer.from(valor, 'base64');
  if (chave.length !== 32) {
    throw new Error('SUBACCOUNT_ENCRYPTION_KEY deve ser uma chave base64 de 32 bytes.');
  }
  return chave;
};

const derivarChave = (contexto) => createHmac('sha256', chaveMestre())
  .update(`estante-babel:${contexto}:v1`)
  .digest();

export const criptografarCpf = (cpf) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derivarChave('cpf-encryption'), iv);
  const ciphertext = Buffer.concat([
    cipher.update(cpf, 'utf8'),
    cipher.final()
  ]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
};

export const gerarIndiceCpf = (cpf) => createHmac('sha256', derivarChave('cpf-index'))
  .update(cpf)
  .digest('hex');

export const descriptografarCpf = (dados) => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    derivarChave('cpf-encryption'),
    Buffer.from(dados.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(dados.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dados.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

export const hashearSenha = async (senha) => {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, 64);
  return {
    salt: salt.toString('base64'),
    hash: Buffer.from(hash).toString('base64')
  };
};

export const verificarSenha = async (senha, credencial) => {
  if (!credencial?.salt || !credencial?.hash) return false;
  const hashArmazenado = Buffer.from(credencial.hash, 'base64');
  const hashInformado = Buffer.from(
    await scrypt(senha, Buffer.from(credencial.salt, 'base64'), hashArmazenado.length)
  );
  return hashArmazenado.length === hashInformado.length &&
    timingSafeEqual(hashArmazenado, hashInformado);
};

export const formatarCpfMascarado = (cpf) => `***.***.***-${cpf.slice(-2)}`;

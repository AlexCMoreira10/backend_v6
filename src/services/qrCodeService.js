import QRCode from 'qrcode';

const baseUrl = () => {
  const value = process.env.PUBLIC_APP_URL || 'http://localhost:3000/api';
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_APP_URL deve usar HTTP ou HTTPS');
  }

  return url.toString().replace(/\/+$/, '');
};

export const criarUrlRastreio = (token) =>
  `${baseUrl()}/livros/rastreio/${encodeURIComponent(token)}`;

export const gerarQrCode = (url) =>
  QRCode.toDataURL(url, { errorCorrectionLevel: 'M', type: 'image/png' });

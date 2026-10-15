import QRCode from 'qrcode';

const baseUrl = () => {
  const value = process.env.PUBLIC_APP_URL
    || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  if (!value) {
    throw new Error('PUBLIC_APP_URL deve apontar para a origem pública do frontend');
  }
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

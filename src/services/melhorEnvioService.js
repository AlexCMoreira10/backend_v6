import { randomBytes } from 'node:crypto';
import { db } from '../config/firebase.js';
import { buscarLivroPorId } from './livroService.js';
import { buscarUsuarioPorId } from './userService.js';
import {
  criptografarTokensMelhorEnvio,
  descriptografarTokensMelhorEnvio
} from '../utils/melhorEnvioToken.js';
import {
  criarPayloadCotacaoMelhorEnvio,
  normalizarCotacoesMelhorEnvio
} from '../utils/melhorEnvioFrete.js';

const estadosOAuth = db.collection('melhor_envio_oauth_states');
const tokensOAuth = db.collection('melhor_envio_tokens');
const TEMPO_LIMITE_ESTADO_MS = 10 * 60 * 1000;
const ID_CONTA_PLATAFORMA = 'platform';

const obterConfiguracao = () => {
  const clientId = process.env.MELHOR_ENVIO_CLIENT_ID;
  const clientSecret = process.env.MELHOR_ENVIO_CLIENT_SECRET;
  const redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI;
  const baseUrl = process.env.MELHOR_ENVIO_BASE_URL || 'https://sandbox.melhorenvio.com.br';
  const supportEmail = process.env.MELHOR_ENVIO_SUPPORT_EMAIL;
  const ownerUid = process.env.MELHOR_ENVIO_OWNER_UID;

  if (!clientId || !clientSecret || !redirectUri || !supportEmail || !baseUrl || !ownerUid) {
    throw new Error(
      'Configure MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET, MELHOR_ENVIO_REDIRECT_URI, MELHOR_ENVIO_BASE_URL, MELHOR_ENVIO_SUPPORT_EMAIL e MELHOR_ENVIO_OWNER_UID.'
    );
  }
  let urlBase;
  try {
    urlBase = new URL(baseUrl);
  } catch {
    throw new Error('MELHOR_ENVIO_BASE_URL deve ser uma URL válida.');
  }
  if (
    urlBase.protocol !== 'https:' ||
    !['sandbox.melhorenvio.com.br', 'melhorenvio.com.br'].includes(urlBase.hostname)
  ) {
    throw new Error('MELHOR_ENVIO_BASE_URL deve apontar para o domínio HTTPS do Melhor Envio.');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    ownerUid,
    apiBaseUrl: urlBase.origin,
    userAgent: `Estante de Babel (${supportEmail})`
  };
};

const obterMensagemErro = (dados, status) => {
  const mensagem = dados?.message || dados?.error_description || dados?.error;
  return typeof mensagem === 'string'
    ? mensagem
    : `O Melhor Envio respondeu com HTTP ${status}.`;
};

const requisitarToken = async (parametros) => {
  const configuracao = obterConfiguracao();
  const resposta = await fetch(`${configuracao.apiBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': configuracao.userAgent
    },
    body: JSON.stringify({
      client_id: configuracao.clientId,
      client_secret: configuracao.clientSecret,
      redirect_uri: configuracao.redirectUri,
      ...parametros
    })
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(obterMensagemErro(dados, resposta.status));
    erro.status = resposta.status;
    throw erro;
  }
  if (!dados?.access_token || !dados?.refresh_token) {
    throw new Error('A resposta de autenticação do Melhor Envio não contém os tokens esperados.');
  }
  return dados;
};

const salvarTokens = async (uid, dados) => {
  const expiresAt = Date.now() + Number(dados.expires_in || 0) * 1000;
  await tokensOAuth.doc(uid).set({
    credenciais: criptografarTokensMelhorEnvio({
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token
    }),
    expiresAt: new Date(expiresAt),
    atualizadoEm: new Date()
  });
};

export const criarUrlAutorizacaoMelhorEnvio = async (uid) => {
  const configuracao = obterConfiguracao();
  if (uid !== configuracao.ownerUid) {
    const erro = new Error('Somente o responsável pela plataforma pode conectar a conta do Melhor Envio.');
    erro.status = 403;
    throw erro;
  }

  const state = randomBytes(32).toString('hex');
  await estadosOAuth.doc(state).set({
    uid: ID_CONTA_PLATAFORMA,
    criadoEm: new Date()
  });

  const url = new URL(`${configuracao.apiBaseUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: configuracao.clientId,
    redirect_uri: configuracao.redirectUri,
    response_type: 'code',
    scope: 'shipping-calculate',
    state
  }).toString();
  return url.toString();
};

export const concluirAutorizacaoMelhorEnvio = async ({ code, state }) => {
  if (!code || !state || !/^[a-f0-9]{64}$/.test(state)) {
    const erro = new Error('Retorno de autorização inválido.');
    erro.status = 400;
    throw erro;
  }

  const stateRef = estadosOAuth.doc(state);
  const stateDoc = await stateRef.get();
  if (!stateDoc.exists) {
    const erro = new Error('A autorização expirou ou já foi utilizada. Tente novamente.');
    erro.status = 400;
    throw erro;
  }

  const dadosState = stateDoc.data();
  await stateRef.delete();
  if (!dadosState.uid || Date.now() - dadosState.criadoEm.toDate().getTime() > TEMPO_LIMITE_ESTADO_MS) {
    const erro = new Error('A autorização expirou. Tente novamente.');
    erro.status = 400;
    throw erro;
  }

  const tokens = await requisitarToken({
    grant_type: 'authorization_code',
    code
  });
  await salvarTokens(dadosState.uid, tokens);
};

export const consultarStatusMelhorEnvio = async (uid) => {
  const configuracao = obterConfiguracao();
  const documento = await tokensOAuth.doc(ID_CONTA_PLATAFORMA).get();
  return {
    conectado: documento.exists,
    podeAutorizar: uid === configuracao.ownerUid
  };
};

const obterAccessToken = async (forcarAtualizacao = false) => {
  const ref = tokensOAuth.doc(ID_CONTA_PLATAFORMA);
  const documento = await ref.get();
  if (!documento.exists) {
    const erro = new Error('A conta de frete da plataforma ainda não foi conectada ao Melhor Envio.');
    erro.status = 409;
    throw erro;
  }

  const registro = documento.data();
  const credenciais = descriptografarTokensMelhorEnvio(registro.credenciais);
  const expiraEm = registro.expiresAt?.toDate().getTime() || 0;
  if (!forcarAtualizacao && expiraEm > Date.now() + 60_000) return credenciais.accessToken;

  let tokensAtualizados;
  try {
    tokensAtualizados = await requisitarToken({
      grant_type: 'refresh_token',
      refresh_token: credenciais.refreshToken
    });
  } catch (erro) {
    if ([400, 401, 422].includes(erro.status)) {
      await ref.delete();
      const erroAutorizacao = new Error('A conexão da plataforma expirou. O responsável precisa autorizar o Melhor Envio novamente.');
      erroAutorizacao.status = 409;
      throw erroAutorizacao;
    }
    throw erro;
  }
  await salvarTokens(uid, tokensAtualizados);
  return tokensAtualizados.access_token;
};

export const calcularFreteMelhorEnvio = async ({ livroId, cepDestino }) => {
  const livro = await buscarLivroPorId(livroId);
  if (!livro) {
    const erro = new Error('Livro não encontrado.');
    erro.status = 404;
    throw erro;
  }
  if (livro.tipo !== 'venda' || livro.status !== 'disponivel') {
    const erro = new Error('A cotação está disponível apenas para livros anunciados para venda.');
    erro.status = 422;
    throw erro;
  }
  if (!livro.usuarioId) {
    const erro = new Error('Não foi possível identificar o vendedor deste livro.');
    erro.status = 422;
    throw erro;
  }

  const vendedor = await buscarUsuarioPorId(livro.usuarioId);
  const payload = criarPayloadCotacaoMelhorEnvio({ livro, vendedor, cepDestino });
  const configuracao = obterConfiguracao();
  const consultarCotacao = (accessToken) => fetch(
    `${configuracao.apiBaseUrl}/api/v2/me/shipment/calculate`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': configuracao.userAgent
      },
      body: JSON.stringify(payload)
    }
  );

  let accessToken = await obterAccessToken();
  let resposta = await consultarCotacao(accessToken);
  let dados = await resposta.json().catch(() => null);
  if (resposta.status === 401) {
    accessToken = await obterAccessToken(true);
    resposta = await consultarCotacao(accessToken);
    dados = await resposta.json().catch(() => null);
  }

  if (!resposta.ok) {
    const erro = new Error(obterMensagemErro(dados, resposta.status));
    erro.status = resposta.status;
    throw erro;
  }

  return {
    cotacoes: normalizarCotacoesMelhorEnvio(dados)
  };
};

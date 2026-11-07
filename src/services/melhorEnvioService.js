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
const TEMPO_LIMITE_REFRESH_MS = 30 * 1000;
const ESPERA_REFRESH_MS = 20 * 1000;
const VALIDADE_REFRESH_TOKEN_MS = 45 * 24 * 60 * 60 * 1000;

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new Error('MELHOR_ENVIO_SUPPORT_EMAIL deve ser um e-mail de suporte válido.');
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
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': configuracao.userAgent
    },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
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
  if (!dados?.access_token) {
    throw new Error('A resposta de autenticação do Melhor Envio não contém um access token válido.');
  }
  return dados;
};

const salvarTokens = async (uid, dados, refreshTokenAnterior) => {
  const segundosExpiracao = Number(dados.expires_in);
  const refreshToken = dados.refresh_token || refreshTokenAnterior;
  if (!Number.isFinite(segundosExpiracao) || segundosExpiracao <= 0 || !refreshToken) {
    throw new Error('A resposta de autenticação do Melhor Envio não contém os dados de validade esperados.');
  }

  const agora = Date.now();
  await tokensOAuth.doc(uid).set({
    credenciais: criptografarTokensMelhorEnvio({
      accessToken: dados.access_token,
      refreshToken
    }),
    expiresAt: new Date(agora + segundosExpiracao * 1000),
    refreshTokenExpiresAt: new Date(agora + VALIDADE_REFRESH_TOKEN_MS),
    atualizadoEm: new Date(agora)
  });
};

const consumirStateAutorizacao = async (state) => {
  if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) {
    const erro = new Error('Retorno de autorização inválido.');
    erro.status = 400;
    throw erro;
  }

  const stateRef = estadosOAuth.doc(state);
  const valido = await db.runTransaction(async (transaction) => {
    const documento = await transaction.get(stateRef);
    if (!documento.exists) return false;

    const dados = documento.data();
    const criadoEm = dados.criadoEm?.toDate?.().getTime();
    transaction.delete(stateRef);
    return dados.uid === ID_CONTA_PLATAFORMA &&
      Number.isFinite(criadoEm) &&
      Date.now() - criadoEm <= TEMPO_LIMITE_ESTADO_MS;
  });

  if (!valido) {
    const erro = new Error('A autorização expirou ou já foi utilizada. Tente novamente.');
    erro.status = 400;
    throw erro;
  }
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
  if (typeof code !== 'string' || !code.trim()) {
    const erro = new Error('Retorno de autorização inválido.');
    erro.status = 400;
    throw erro;
  }

  await consumirStateAutorizacao(state);

  const tokens = await requisitarToken({
    grant_type: 'authorization_code',
    code
  });
  await salvarTokens(ID_CONTA_PLATAFORMA, tokens);
};

export const rejeitarAutorizacaoMelhorEnvio = async (state) => {
  await consumirStateAutorizacao(state);
};

export const consultarStatusMelhorEnvio = async (uid) => {
  const documento = await tokensOAuth.doc(ID_CONTA_PLATAFORMA).get();
  const ownerUid = process.env.MELHOR_ENVIO_OWNER_UID;
  return {
    conectado: documento.exists,
    podeAutorizar: Boolean(ownerUid && uid === ownerUid),
    responsavelConfigurado: Boolean(ownerUid)
  };
};

const criarErroConexaoExpirada = () => {
  const erro = new Error('A conexão da plataforma expirou. O responsável precisa autorizar o Melhor Envio novamente.');
  erro.status = 409;
  return erro;
};

const esperar = (tempo) => new Promise(resolve => setTimeout(resolve, tempo));

const obterAccessToken = async ({ tokenRejeitado } = {}) => {
  const ref = tokensOAuth.doc(ID_CONTA_PLATAFORMA);
  const inicioEspera = Date.now();

  while (Date.now() - inicioEspera < ESPERA_REFRESH_MS) {
    const idLease = randomBytes(16).toString('hex');
    const decisao = await db.runTransaction(async (transaction) => {
      const documento = await transaction.get(ref);
      if (!documento.exists) {
        const erro = new Error('A conta de frete da plataforma ainda não foi conectada ao Melhor Envio.');
        erro.status = 409;
        throw erro;
      }

      const registro = documento.data();
      const credenciais = descriptografarTokensMelhorEnvio(registro.credenciais);
      const expiraEm = registro.expiresAt?.toDate?.().getTime() || 0;
      if (
        tokenRejeitado &&
        credenciais.accessToken !== tokenRejeitado &&
        expiraEm > Date.now() + 60_000
      ) {
        return { accessToken: credenciais.accessToken };
      }
      if (!tokenRejeitado && expiraEm > Date.now() + 60_000) {
        return { accessToken: credenciais.accessToken };
      }

      const refreshExpiraEm = registro.refreshTokenExpiresAt?.toDate?.().getTime() || 0;
      if (refreshExpiraEm && refreshExpiraEm <= Date.now()) {
        transaction.delete(ref);
        return { expirado: true };
      }

      const lease = registro.refreshLease;
      const leaseExpiraEm = lease?.expiresAt?.toDate?.().getTime() || 0;
      if (lease?.id && leaseExpiraEm > Date.now()) return { aguardando: true };

      transaction.set(ref, {
        refreshLease: {
          id: idLease,
          expiresAt: new Date(Date.now() + TEMPO_LIMITE_REFRESH_MS)
        }
      }, { merge: true });

      return {
        idLease,
        refreshToken: credenciais.refreshToken,
        refreshTokenExpiresAt: registro.refreshTokenExpiresAt || null
      };
    });

    if (decisao.accessToken) return decisao.accessToken;
    if (decisao.expirado) throw criarErroConexaoExpirada();
    if (decisao.aguardando) {
      await esperar(250);
      continue;
    }

    try {
      const tokensAtualizados = await requisitarToken({
        grant_type: 'refresh_token',
        refresh_token: decisao.refreshToken
      });
      const segundosExpiracao = Number(tokensAtualizados.expires_in);
      const refreshToken = tokensAtualizados.refresh_token || decisao.refreshToken;
      const refreshTokenAtualizado = Boolean(tokensAtualizados.refresh_token);
      if (!Number.isFinite(segundosExpiracao) || segundosExpiracao <= 0 || !refreshToken) {
        throw new Error('A resposta de renovação do Melhor Envio não contém os dados de validade esperados.');
      }

      return await db.runTransaction(async (transaction) => {
        const documento = await transaction.get(ref);
        if (!documento.exists) throw criarErroConexaoExpirada();
        const registro = documento.data();
        if (registro.refreshLease?.id !== idLease) {
          const credenciaisAtuais = descriptografarTokensMelhorEnvio(registro.credenciais);
          if (registro.expiresAt?.toDate?.().getTime() > Date.now()) {
            return credenciaisAtuais.accessToken;
          }
          throw criarErroConexaoExpirada();
        }

        const agora = Date.now();
        transaction.set(ref, {
          credenciais: criptografarTokensMelhorEnvio({
            accessToken: tokensAtualizados.access_token,
            refreshToken
          }),
          expiresAt: new Date(agora + segundosExpiracao * 1000),
          refreshTokenExpiresAt: refreshTokenAtualizado
            ? new Date(agora + VALIDADE_REFRESH_TOKEN_MS)
            : decisao.refreshTokenExpiresAt,
          atualizadoEm: new Date(agora),
          refreshLease: null
        });
        return tokensAtualizados.access_token;
      });
    } catch (erro) {
      if ([400, 401, 422].includes(erro.status)) {
        await db.runTransaction(async (transaction) => {
          const documento = await transaction.get(ref);
          if (documento.exists && documento.data().refreshLease?.id === idLease) {
            transaction.delete(ref);
          }
        });
        throw criarErroConexaoExpirada();
      }

      await db.runTransaction(async (transaction) => {
        const documento = await transaction.get(ref);
        if (documento.exists && documento.data().refreshLease?.id === idLease) {
          transaction.set(ref, { refreshLease: null }, { merge: true });
        }
      });
      throw erro;
    }
  }

  const erro = new Error('A renovação da conexão está em andamento. Tente consultar o frete novamente.');
  erro.status = 503;
  throw erro;
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
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify(payload)
    }
  );

  let accessToken = await obterAccessToken();
  let resposta = await consultarCotacao(accessToken);
  let dados = await resposta.json().catch(() => null);
  if (resposta.status === 401) {
    accessToken = await obterAccessToken({ tokenRejeitado: accessToken });
    resposta = await consultarCotacao(accessToken);
    dados = await resposta.json().catch(() => null);
  }

  if (resposta.status === 401) {
    const ref = tokensOAuth.doc(ID_CONTA_PLATAFORMA);
    await db.runTransaction(async (transaction) => {
      const documento = await transaction.get(ref);
      if (!documento.exists) return;
      const credenciais = descriptografarTokensMelhorEnvio(documento.data().credenciais);
      if (credenciais.accessToken === accessToken) transaction.delete(ref);
    });
    throw criarErroConexaoExpirada();
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

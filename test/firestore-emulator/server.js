import './guard.js';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auth, db, FieldPath, FieldValue } from './admin.js';
import { criarMiddlewareAutenticacaoSebo } from './auth.js';
import { criarRouterMeuSebo } from '../../src/routes/seboMeRouter.js';
import { criarSincronizadorLocalizacaoSebo } from '../../src/services/seboLocationSyncService.js';
import { criarAtualizadorSebo } from '../../src/services/seboProfileService.js';
import { criarGeocodificadorSimulado } from './geocodingMock.js';

const PROJECT_ID = 'demo-estante-babel';
const LOCAL_FRONTEND_HOSTS = new Set(['localhost', '127.0.0.1']);
const AUTH_EMULATOR_HEALTH_URL =
  `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/config`;

const corsLocalTeste = (req, res, next) => {
  const origin = req.get('origin');
  if (!origin) return next();

  let origemUrl;
  try {
    origemUrl = new URL(origin);
  } catch {
    return res.status(403).json({ erro: 'Origem não permitida no servidor de teste' });
  }
  if (origemUrl.protocol !== 'http:' ||
      !LOCAL_FRONTEND_HOSTS.has(origemUrl.hostname) ||
      origemUrl.origin !== origin) {
    return res.status(403).json({ erro: 'Origem não permitida no servidor de teste' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
};

const criarHandlers = () => {
  const sincronizarLocalizacaoSebo = criarSincronizadorLocalizacaoSebo({
    db,
    deleteField: () => FieldValue.delete(),
    documentIdFieldPath: FieldPath.documentId(),
    geocodificarEndereco: criarGeocodificadorSimulado(),
    logger: console
  });
  const atualizarSebo = criarAtualizadorSebo({
    db,
    deleteField: () => FieldValue.delete(),
    sincronizarLocalizacao: sincronizarLocalizacaoSebo
  });

  return {
    buscarMeuSebo: async (req, res) => {
      try {
        const snapshot = await db.collection('sebos').doc(req.usuario.uid).get();
        if (!snapshot.exists) {
          return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
        }
        return res.json({ id: snapshot.id, ...snapshot.data() });
      } catch {
        return res.status(500).json({ erro: 'Erro ao buscar cadastro do sebo' });
      }
    },
    atualizarMeuSebo: async (req, res) => {
      try {
        const sebo = await atualizarSebo(req.seboId, req.body);
        if (!sebo) {
          return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
        }
        return res.json(sebo);
      } catch (error) {
        if (error.status) return res.status(error.status).json({ erro: error.message });
        return res.status(500).json({
          erro: 'Não foi possível atualizar o cadastro do sebo'
        });
      }
    },
    sincronizarLocalizacaoMeuSebo: async (req, res) => {
      try {
        const resultado = await sincronizarLocalizacaoSebo(req.seboId);
        if (!resultado) {
          return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
        }
        return res.json(resultado);
      } catch {
        return res.status(500).json({
          erro: 'Não foi possível retomar a sincronização da localização'
        });
      }
    }
  };
};

const verificarAuthEmulator = async () => {
  const response = await fetch(AUTH_EMULATOR_HEALTH_URL, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(1500)
  });
  if (!response.ok) {
    throw new Error(`Auth Emulator respondeu com HTTP ${response.status}`);
  }
  await response.json();
};

const verificarFirestoreEmulator = async () => {
  let timeout;
  try {
    await Promise.race([
      db.listCollections(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Firestore Emulator não respondeu dentro do prazo')),
          1500
        );
        timeout.unref();
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

const criarAppTeste = () => {
  const app = express();
  app.use(corsLocalTeste);
  app.use(express.json());
  app.get('/api/__test/health', async (_req, res) => {
    const [authResult, firestoreResult] = await Promise.allSettled([
      verificarAuthEmulator(),
      verificarFirestoreEmulator()
    ]);
    const authEmulator = authResult.status === 'fulfilled';
    const firestoreEmulator = firestoreResult.status === 'fulfilled';
    const health = {
      environment: 'test',
      projectId: PROJECT_ID,
      authEmulator,
      firestoreEmulator
    };

    if (!authEmulator || !firestoreEmulator) {
      return res.status(503).json({
        ...health,
        erro: 'Um ou mais Emulators não estão acessíveis.'
      });
    }
    return res.json(health);
  });

  const { verificarTokenSebo, exigirGestorSebo } =
    criarMiddlewareAutenticacaoSebo({ auth, db });
  app.get('/api/sebos/sessao', verificarTokenSebo, async (req, res) => {
    try {
      const snapshot = await db.collection('sebos').doc(req.seboId).get();
      if (!snapshot.exists) {
        return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
      }
      return res.json({
        id: snapshot.id,
        ...snapshot.data(),
        tipoConta: 'gestor',
        seboId: req.seboId
      });
    } catch {
      return res.status(500).json({ erro: 'Erro ao buscar sessão do sebo' });
    }
  });
  app.use('/api', criarRouterMeuSebo({
    verificarTokenSebo,
    exigirGestorSebo,
    ...criarHandlers()
  }));
  return app;
};

export const criarServidorTeste = () => criarAppTeste();

export const iniciarServidorTeste = ({
  port = Number(process.env.TEST_API_PORT || 3000),
  host = '127.0.0.1'
} = {}) => {
  if (host !== '127.0.0.1') {
    throw new Error('O servidor de teste só pode escutar em 127.0.0.1.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TEST_API_PORT deve ser uma porta TCP válida.');
  }

  const server = criarServidorTeste().listen(port, host, () => {
    console.info(`[API de teste] Escutando somente em http://${host}:${port}`);
  });
  return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  iniciarServidorTeste();
}

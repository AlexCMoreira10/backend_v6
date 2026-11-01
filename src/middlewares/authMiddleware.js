import admin from '../config/firebase.js';
import { db } from '../config/firebase.js';

export const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const token = authHeader.replace('Bearer ', '');

    const decodedToken = await admin.auth().verifyIdToken(token);
    if (decodedToken.accountType === 'sebo_staff') {
      return res.status(403).json({ erro: 'Este token não pode acessar as rotas de usuários' });
    }

    req.usuario = decodedToken;

    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

export const verificarTokenMensagens = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  req.usuario = decodedToken;
  if (decodedToken.accountType !== 'sebo_staff') {
    req.idUsuarioMensagens = decodedToken.uid;
    return next();
  }

  const { staffId, seboId, uid } = decodedToken;
  if (!staffId || !seboId || !uid) {
    return res.status(401).json({ erro: 'Token de subconta inválido' });
  }

  try {
    const snapshot = await db.collection('sebo_subcontas').doc(staffId).get();
    const subconta = snapshot.exists ? snapshot.data() : null;
    if (!subconta || !subconta.ativo || subconta.uid !== uid || subconta.seboId !== seboId) {
      return res.status(403).json({ erro: 'Esta subconta foi revogada ou está inativa' });
    }
    if (subconta.precisaTrocarSenha) {
      return res.status(403).json({ erro: 'Troque a senha temporária antes de continuar' });
    }
    if (!(subconta.permissoes || []).includes('mensagens.gerenciar')) {
      return res.status(403).json({ erro: 'Sua subconta não tem permissão para gerenciar mensagens' });
    }

    req.subconta = subconta;
    req.seboId = seboId;
    req.idUsuarioMensagens = seboId;
    return next();
  } catch (error) {
    console.error('Erro ao verificar acesso da subconta às mensagens:', error);
    return res.status(500).json({ erro: 'Não foi possível verificar o acesso às mensagens' });
  }
};

const criarVerificadorSebo = ({ permitirTrocaSenha = false } = {}) => async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }
  req.usuario = decodedToken;

  try {
    if (decodedToken.accountType === 'sebo_staff') {
      const { staffId, seboId, uid } = decodedToken;
      if (!staffId || !seboId || !uid) {
        return res.status(401).json({ erro: 'Token de subconta inválido' });
      }

      const snapshot = await db.collection('sebo_subcontas').doc(staffId).get();
      const subconta = snapshot.exists ? snapshot.data() : null;
      if (!subconta || !subconta.ativo || subconta.uid !== uid || subconta.seboId !== seboId) {
        return res.status(403).json({ erro: 'Esta subconta foi revogada ou está inativa' });
      }
      if (subconta.precisaTrocarSenha && !permitirTrocaSenha) {
        return res.status(403).json({ erro: 'Troque a senha temporária antes de continuar' });
      }

      req.seboId = seboId;
      req.subconta = subconta;
      return next();
    }

    const seboDoc = await db.collection('sebos').doc(decodedToken.uid).get();
    if (!seboDoc.exists) {
      return res.status(403).json({ erro: 'A conta autenticada não é gestora de um sebo' });
    }

    req.seboId = decodedToken.uid;
    req.subconta = null;
    return next();
  } catch (error) {
    console.error('Erro ao verificar acesso à conta de sebo:', error);
    return res.status(500).json({ erro: 'Não foi possível verificar o acesso à conta' });
  }
};

export const verificarTokenSebo = criarVerificadorSebo();
export const verificarTokenSeboParaTrocaSenha = criarVerificadorSebo({
  permitirTrocaSenha: true
});

export const exigirGestorSebo = (req, res, next) => {
  if (req.subconta) {
    return res.status(403).json({ erro: 'Somente o gestor do sebo pode gerenciar subcontas' });
  }
  return next();
};

export const exigirSubcontaSebo = (req, res, next) => {
  if (!req.subconta) {
    return res.status(403).json({ erro: 'Esta operação é exclusiva para colaboradores' });
  }
  return next();
};

export const exigirPermissaoSebo = (...permissoesNecessarias) => (req, res, next) => {
  if (!req.subconta) return next();

  const permissoes = new Set(req.subconta.permissoes || []);
  if (!permissoesNecessarias.every((permissao) => permissoes.has(permissao))) {
    return res.status(403).json({ erro: 'Sua subconta não tem permissão para esta operação' });
  }
  return next();
};

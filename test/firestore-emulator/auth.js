import './guard.js';

export const criarMiddlewareAutenticacaoSebo = ({ auth, db }) => {
  const verificarTokenSebo = async (req, res, next) => {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(authorization.slice(7));
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
        if (!subconta || !subconta.ativo || subconta.uid !== uid ||
            subconta.seboId !== seboId) {
          return res.status(403).json({ erro: 'Esta subconta foi revogada ou está inativa' });
        }
        if (subconta.precisaTrocarSenha) {
          return res.status(403).json({
            erro: 'Troque a senha temporária antes de continuar'
          });
        }

        req.seboId = seboId;
        req.subconta = subconta;
        return next();
      }

      const seboSnapshot = await db.collection('sebos').doc(decodedToken.uid).get();
      if (!seboSnapshot.exists) {
        return res.status(403).json({ erro: 'A conta autenticada não é gestora de um sebo' });
      }

      req.seboId = decodedToken.uid;
      req.subconta = null;
      return next();
    } catch {
      return res.status(500).json({ erro: 'Não foi possível verificar o acesso à conta' });
    }
  };

  const exigirGestorSebo = (req, res, next) => {
    if (req.subconta) {
      return res.status(403).json({
        erro: 'Somente o gestor do sebo pode gerenciar subcontas'
      });
    }
    return next();
  };

  return { verificarTokenSebo, exigirGestorSebo };
};

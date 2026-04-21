import admin from '../config/firebase.js';

export const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const token = authHeader.replace('Bearer ', '');

    const decodedToken = await admin.auth().verifyIdToken(token);

    req.usuario = decodedToken;

    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

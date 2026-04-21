import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 🔐 Rota protegida
router.get('/protegida', verificarToken, (req, res) => {
  res.json({
    mensagem: 'Acesso permitido',
    usuario: req.usuario,
  });
});

export default router;

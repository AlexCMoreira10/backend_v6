import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  atualizarPerfil,
  cadastrarUsuario,
  criarOuBuscarUsuario
} from '../controllers/userControlllers.js';

const router = express.Router();

router.post('/usuarios/cadastro', cadastrarUsuario);
router.get('/me', verificarToken, criarOuBuscarUsuario);
router.put('/me', verificarToken, atualizarPerfil);

export default router;
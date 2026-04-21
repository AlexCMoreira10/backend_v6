import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import { criarOuBuscarUsuario } from '../controllers/userControlllers.js';

const router = express.Router();

router.get('/me', verificarToken, criarOuBuscarUsuario);

export default router;
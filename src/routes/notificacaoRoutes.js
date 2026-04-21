import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  listarNotificacoesController,
  marcarNotificacaoComoLidaController
} from '../controllers/notificacaoController.js';

const router = express.Router();

router.get('/notificacoes', verificarToken, listarNotificacoesController);

router.put('/notificacoes/:id/lida', verificarToken, marcarNotificacaoComoLidaController);

export default router;

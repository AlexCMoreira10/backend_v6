import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  enviarMensagemController,
  listarMensagensController,
  listarConversasController,
  listarMensagensDaConversaController,
  marcarMensagemComoLidaController
} from '../controllers/mensagemController.js';

const router = express.Router();

router.get('/mensagens/conversas', verificarToken, listarConversasController);
router.get('/mensagens', verificarToken, listarMensagensController);
router.get('/mensagens/:id_usuario', verificarToken, listarMensagensDaConversaController);
router.post('/mensagens', verificarToken, enviarMensagemController);
router.put('/mensagens/:id/lida', verificarToken, marcarMensagemComoLidaController);

export default router;

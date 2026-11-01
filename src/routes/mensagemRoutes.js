import express from 'express';
import { verificarTokenMensagens } from '../middlewares/authMiddleware.js';
import {
  enviarMensagemController,
  listarMensagensController,
  listarConversasController,
  listarMensagensDaConversaController,
  marcarMensagemComoLidaController,
  apagarMensagemController,
  apagarTodasMensagensController
} from '../controllers/mensagemController.js';

const router = express.Router();

router.get('/mensagens/conversas', verificarTokenMensagens, listarConversasController);
router.get('/mensagens', verificarTokenMensagens, listarMensagensController);
router.get('/mensagens/:id_usuario', verificarTokenMensagens, listarMensagensDaConversaController);
router.post('/mensagens', verificarTokenMensagens, enviarMensagemController);
router.delete('/mensagens', verificarTokenMensagens, apagarTodasMensagensController);
router.put('/mensagens/:id/lida', verificarTokenMensagens, marcarMensagemComoLidaController);
router.delete('/mensagens/:id', verificarTokenMensagens, apagarMensagemController);

export default router;

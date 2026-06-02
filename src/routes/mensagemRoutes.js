import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import { enviarMensagemController } from '../controllers/mensagemController.js';

const router = express.Router();

router.post('/mensagens', verificarToken, enviarMensagemController);

export default router;

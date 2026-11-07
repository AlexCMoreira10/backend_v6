import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  calcularFreteMelhorEnvioController,
  callbackMelhorEnvioController,
  consultarStatusMelhorEnvioController,
  criarAutorizacaoMelhorEnvioController,
  redirecionarAutorizacaoMelhorEnvioController
} from '../controllers/melhorEnvioController.js';

const router = express.Router();

router.post('/melhor-envio/authorize', verificarToken, criarAutorizacaoMelhorEnvioController);
router.get('/melhor-envio/autorizar', verificarToken, redirecionarAutorizacaoMelhorEnvioController);
router.get('/melhor-envio/callback', callbackMelhorEnvioController);
router.get('/melhor-envio/status', verificarToken, consultarStatusMelhorEnvioController);
router.post('/melhor-envio/cotacao', calcularFreteMelhorEnvioController);
router.post('/livros/:id/frete', verificarToken, calcularFreteMelhorEnvioController);

export default router;

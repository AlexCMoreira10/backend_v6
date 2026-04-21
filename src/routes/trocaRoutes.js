import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';

import {
    aceitarTrocaController,
    listarMinhasTrocasController,
    recusarTrocaController,
    solicitarTrocaController
} from '../controllers/trocaControllers.js';

const router = express.Router();

router.post('/trocas', verificarToken, solicitarTrocaController);
router.put('/trocas/:id/aceitar', verificarToken, aceitarTrocaController);
router.put('/trocas/:id/recusar', verificarToken, recusarTrocaController);
router.get('/trocas', verificarToken, listarMinhasTrocasController);

export default router;

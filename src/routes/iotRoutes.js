import express from 'express';
import { salvarDadosIoTController, exibirDadosIoTController } from '../controllers/iotController.js';

const router = express.Router();

router.post('/iot', salvarDadosIoTController);
router.get('/iot', exibirDadosIoTController);

export default router;
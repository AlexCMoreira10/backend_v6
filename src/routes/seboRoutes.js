import express from 'express';
import {
  exigirGestorSebo,
  exigirSubcontaSebo,
  verificarToken,
  verificarTokenSebo,
  verificarTokenSeboParaTrocaSenha
} from '../middlewares/authMiddleware.js';
import {
  buscarMeuSebo as buscarMeuSeboController,
  cadastrarSebo
} from '../controllers/seboController.js';
import {
  autenticarSubconta,
  atualizarSubconta,
  buscarMinhaSubconta,
  criarSubconta,
  listarSubcontas,
  buscarMinhaSessao,
  redefinirSenhaSubconta,
  revogarSubconta,
  trocarMinhaSenha
} from '../controllers/subcontaController.js';

const router = express.Router();

router.post('/sebos/cadastro', verificarToken, cadastrarSebo);
router.post('/sebos/subcontas/login', autenticarSubconta);
router.get('/sebos/sessao', verificarTokenSeboParaTrocaSenha, buscarMinhaSessao);
router.get('/sebos/me', verificarTokenSebo, buscarMeuSeboController);
router.get('/sebos/subcontas/minha', verificarTokenSebo, exigirSubcontaSebo, buscarMinhaSubconta);
router.patch('/sebos/subcontas/minha-senha', verificarTokenSeboParaTrocaSenha, exigirSubcontaSebo, trocarMinhaSenha);
router.get('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, listarSubcontas);
router.post('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, criarSubconta);
router.patch('/sebos/subcontas/:id/senha', verificarTokenSebo, exigirGestorSebo, redefinirSenhaSubconta);
router.patch('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, atualizarSubconta);
router.delete('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, revogarSubconta);

export default router;

import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  criarLivroController,
  listarLivrosController,
  atualizarLivroController,
  deletarLivroController,
  listarMeusLivrosController
} from '../controllers/livroController.js';

const router = express.Router();

router.post('/livros', verificarToken, criarLivroController);
router.get('/livros', listarLivrosController);
router.put('/livros/:id', verificarToken, atualizarLivroController);
router.delete('/livros/:id', verificarToken, deletarLivroController);
router.get('/me/livros', verificarToken, listarMeusLivrosController);

export default router;

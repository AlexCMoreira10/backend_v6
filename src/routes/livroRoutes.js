import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  criarLivroController,
  listarLivrosController,
  atualizarLivroController,
  deletarLivroController,
  listarMeusLivrosController
} from '../controllers/livroController.js';
import {
  atualizarEstadoAcervoController,
  buscarRastreioController,
  confirmarAquisicaoController,
  listarEstanteController,
  obterQrCodeController,
  recusarAquisicaoController,
  registrarAvaliacaoController,
  solicitarAquisicaoController
} from '../controllers/rastreamentoController.js';

const router = express.Router();

router.get('/livros/rastreio/:token', buscarRastreioController);
router.post('/livros/rastreio/:token/aquisicao', verificarToken, solicitarAquisicaoController);
router.get('/me/estante', verificarToken, listarEstanteController);
router.put('/me/estante/:id/estado', verificarToken, atualizarEstadoAcervoController);
router.post('/livros', verificarToken, criarLivroController);
router.get('/livros', verificarToken, listarLivrosController);
router.get('/livros/:id', verificarToken, listarLivrosController); // Detalhes do livro por ID (reutiliza o mesmo controller)
router.get('/livros/:id/qrcode', verificarToken, obterQrCodeController);
router.post('/livros/:id/avaliacoes', verificarToken, registrarAvaliacaoController);
router.post('/livros/:id/aquisicoes/confirmar', verificarToken, confirmarAquisicaoController);
router.post('/livros/:id/aquisicoes/recusar', verificarToken, recusarAquisicaoController);
router.put('/livros/:id', verificarToken, atualizarLivroController);
router.delete('/livros/:id', verificarToken, deletarLivroController);
router.get('/me/livros', verificarToken, listarMeusLivrosController);

export default router;

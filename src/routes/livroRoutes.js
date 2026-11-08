import express from 'express';
import { verificarToken } from '../middlewares/authMiddleware.js';
import {
  criarLivroController,
  publicarRascunhoLivroController,
  criarRascunhoImagensLivroController,
  descartarRascunhoLivroController,
  limparRascunhosExpiradosController,
  listarLivrosController,
  listarLivrosProximosController,
  atualizarLivroController,
  deletarLivroController,
  listarMeusLivrosController,
  listarEstanteController
} from '../controllers/livroController.js';
import {
  atualizarEstadoAcervoController,
  buscarRastreioController,
  confirmarAquisicaoController,
  obterQrCodeController,
  recusarAquisicaoController,
  registrarAvaliacaoController,
  solicitarAquisicaoController
} from '../controllers/rastreamentoController.js';

const router = express.Router();

router.get('/jobs/limpar-rascunhos-livro', limparRascunhosExpiradosController);
router.get('/livros/rastreio/:token', buscarRastreioController);
router.post('/livros/rastreio/:token/aquisicao', verificarToken, solicitarAquisicaoController);
router.get('/me/estante', verificarToken, listarEstanteController);
router.put('/me/estante/:id/estado', verificarToken, atualizarEstadoAcervoController);
router.post('/livros/rascunhos', verificarToken, criarLivroController);
router.post('/livros/rascunhos/:id/publicar', verificarToken, publicarRascunhoLivroController);
router.post('/livros/proximos', listarLivrosProximosController);
router.delete('/livros/rascunhos/:draftId', verificarToken, descartarRascunhoLivroController);
router.post('/livros/:id/rascunhos-imagens', verificarToken, criarRascunhoImagensLivroController);
router.delete(
  '/livros/:id/rascunhos-imagens/:draftId',
  verificarToken,
  descartarRascunhoLivroController
);
// Compatibilidade: a criação direta também resulta em rascunho, nunca em anúncio público.
router.post('/livros', verificarToken, criarLivroController);
router.get('/livros', listarLivrosController);
router.get('/livros/:id', verificarToken, listarLivrosController); // Detalhes do livro por ID (reutiliza o mesmo controller)
router.get('/livros/:id/qrcode', verificarToken, obterQrCodeController);
router.post('/livros/:id/avaliacoes', verificarToken, registrarAvaliacaoController);
router.post('/livros/:id/aquisicoes/confirmar', verificarToken, confirmarAquisicaoController);
router.post('/livros/:id/aquisicoes/recusar', verificarToken, recusarAquisicaoController);
router.put('/livros/:id', verificarToken, atualizarLivroController);
router.delete('/livros/:id', verificarToken, deletarLivroController);
router.get('/me/livros', verificarToken, listarMeusLivrosController);

export default router;

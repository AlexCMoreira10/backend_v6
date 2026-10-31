import express from 'express';
import {
  exigirPermissaoSebo,
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
import {
  criarLivroSeboController,
  enviarImagemLivroController,
  removerImagensLivroController
} from '../controllers/livroController.js';

const router = express.Router();
const parseImagemLivro = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '4mb'
});
const interpretarImagemLivro = (req, res, next) => {
  parseImagemLivro(req, res, (error) => {
    if (!error) return next();
    if (error.status === 413) {
      return res.status(413).json({ erro: 'Cada imagem deve ter no máximo 4 MB' });
    }
    return next(error);
  });
};

router.post('/sebos/cadastro', verificarToken, cadastrarSebo);
router.post('/sebos/subcontas/login', autenticarSubconta);
router.get('/sebos/sessao', verificarTokenSeboParaTrocaSenha, buscarMinhaSessao);
router.get('/sebos/me', verificarTokenSebo, buscarMeuSeboController);
router.post(
  '/sebos/livros',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.cadastrar'),
  criarLivroSeboController
);
router.post(
  '/sebos/livros/imagens',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.cadastrar'),
  interpretarImagemLivro,
  enviarImagemLivroController
);
router.delete(
  '/sebos/livros/imagens',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.cadastrar'),
  removerImagensLivroController
);
router.get('/sebos/subcontas/minha', verificarTokenSebo, exigirSubcontaSebo, buscarMinhaSubconta);
router.patch('/sebos/subcontas/minha-senha', verificarTokenSeboParaTrocaSenha, exigirSubcontaSebo, trocarMinhaSenha);
router.get('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, listarSubcontas);
router.post('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, criarSubconta);
router.patch('/sebos/subcontas/:id/senha', verificarTokenSebo, exigirGestorSebo, redefinirSenhaSubconta);
router.patch('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, atualizarSubconta);
router.delete('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, revogarSubconta);

export default router;

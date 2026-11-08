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
  atualizarMeuSebo,
  buscarMeuSebo as buscarMeuSeboController,
  cadastrarSebo,
  sincronizarLocalizacaoMeuSebo
} from '../controllers/seboController.js';
import { criarRouterMeuSebo } from './seboMeRouter.js';
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
  listarLivrosSeboController,
  enviarImagemLivroController,
  removerImagensLivroController
} from '../controllers/livroController.js';
import {
  baixarModeloAnunciosEmMassa,
  importarAnunciosEmMassa
} from '../controllers/livroImportacaoController.js';

const router = express.Router();
const parseImagemLivro = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '4mb'
});
const parsePlanilhaLivros = express.raw({
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
const interpretarPlanilhaLivros = (req, res, next) => {
  parsePlanilhaLivros(req, res, (error) => {
    if (!error) return next();
    if (error.status === 413) {
      return res.status(413).json({ erro: 'A planilha deve ter no máximo 4 MB' });
    }
    return next(error);
  });
};

router.post('/sebos/cadastro', verificarToken, cadastrarSebo);
router.post('/sebos/subcontas/login', autenticarSubconta);
router.get('/sebos/sessao', verificarTokenSeboParaTrocaSenha, buscarMinhaSessao);
router.use(criarRouterMeuSebo({
  verificarTokenSebo,
  exigirGestorSebo,
  buscarMeuSebo: buscarMeuSeboController,
  atualizarMeuSebo,
  sincronizarLocalizacaoMeuSebo
}));
router.get(
  '/sebos/livros',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.consultar'),
  listarLivrosSeboController
);
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
router.get(
  '/sebos/livros/importacao/modelo',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.cadastrar'),
  baixarModeloAnunciosEmMassa
);
router.post(
  '/sebos/livros/importacao',
  verificarTokenSebo,
  exigirPermissaoSebo('acervo.cadastrar'),
  interpretarPlanilhaLivros,
  importarAnunciosEmMassa
);
router.get('/sebos/subcontas/minha', verificarTokenSebo, exigirSubcontaSebo, buscarMinhaSubconta);
router.patch('/sebos/subcontas/minha-senha', verificarTokenSeboParaTrocaSenha, exigirSubcontaSebo, trocarMinhaSenha);
router.get('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, listarSubcontas);
router.post('/sebos/subcontas', verificarTokenSebo, exigirGestorSebo, criarSubconta);
router.patch('/sebos/subcontas/:id/senha', verificarTokenSebo, exigirGestorSebo, redefinirSenhaSubconta);
router.patch('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, atualizarSubconta);
router.delete('/sebos/subcontas/:id', verificarTokenSebo, exigirGestorSebo, revogarSubconta);

export default router;

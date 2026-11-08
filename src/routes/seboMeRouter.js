import express from 'express';

export const criarRouterMeuSebo = ({
  verificarTokenSebo,
  exigirGestorSebo,
  buscarMeuSebo,
  atualizarMeuSebo,
  sincronizarLocalizacaoMeuSebo
}) => {
  const router = express.Router();

  router.get('/sebos/me', verificarTokenSebo, buscarMeuSebo);
  router.patch('/sebos/me', verificarTokenSebo, exigirGestorSebo, atualizarMeuSebo);
  router.post(
    '/sebos/me/localizacao/sincronizar',
    verificarTokenSebo,
    exigirGestorSebo,
    sincronizarLocalizacaoMeuSebo
  );

  return router;
};

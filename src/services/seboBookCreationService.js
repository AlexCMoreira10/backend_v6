import { geocodeSeboValido } from '../utils/seboGeocode.js';

export const criarCriadorLivroSebo = ({
  buscarSebo,
  prepararLocalizacao,
  persistir,
  validarDadosNovoLivro
}) => async ({ seboId, dados }) => {
  const erro = validarDadosNovoLivro(dados, true);
  if (erro) {
    const falha = new Error(erro);
    falha.status = 400;
    throw falha;
  }

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    let sebo = await buscarSebo(seboId);
    if (!sebo) {
      const falha = new Error('Cadastro de sebo não encontrado');
      falha.status = 404;
      throw falha;
    }
    if (!geocodeSeboValido(sebo.geocode) && sebo.localizacaoSyncStatus !== 'pendente') {
      sebo = await prepararLocalizacao(seboId);
      if (!sebo) {
        const falha = new Error('Cadastro de sebo não encontrado');
        falha.status = 404;
        throw falha;
      }
    }
    if (!geocodeSeboValido(sebo.geocode) && sebo.localizacaoSyncStatus !== 'pendente') {
      const falha = new Error('A localização comercial do sebo ainda não foi confirmada');
      falha.status = 422;
      throw falha;
    }

    try {
      return await persistir({
        dados,
        usuarioId: seboId,
        usuarioNome: sebo.nome,
        seboId,
        seboNome: sebo.nome,
        geocodeSebo: sebo.geocode,
        localizacaoVersaoPerfil: Number(sebo.localizacaoVersao) || 0
      });
    } catch (falha) {
      if (falha.code !== 'sebo/location-version-changed' || tentativa === 2) throw falha;
    }
  }

  throw new Error('Não foi possível confirmar a versão da localização do sebo');
};

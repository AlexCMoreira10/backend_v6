export const removerGeolocalizacaoLivro = livro => {
  const { geocode, ...livroPublico } = livro;
  if (!livro.seboId) {
    delete livroPublico.localizacao;
    delete livroPublico.localizacaoVersaoPerfil;
  }
  return livroPublico;
};

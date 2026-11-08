export const removerGeolocalizacaoLivro = livro => {
  const { geocode, ...livroPublico } = livro;
  delete livroPublico.localizacaoVersaoPerfil;
  if (!livro.seboId) {
    delete livroPublico.localizacao;
  }
  return livroPublico;
};

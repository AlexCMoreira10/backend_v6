export const removerGeolocalizacaoLivro = livro => {
  const { geocode, ...livroPublico } = livro;
  return livroPublico;
};

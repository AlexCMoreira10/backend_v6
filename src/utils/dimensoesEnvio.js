const CAMPOS_DIMENSOES = ['altura', 'largura', 'comprimento', 'peso'];

export const validarDimensoesEnvio = (dimensoes) => {
  if (dimensoes == null) return null;
  if (typeof dimensoes !== 'object' || Array.isArray(dimensoes)) {
    return 'Dimensões de envio devem ser um objeto';
  }

  for (const campo of CAMPOS_DIMENSOES) {
    const valor = dimensoes[campo];
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
      return `A dimensão "${campo}" deve ser um número maior que zero`;
    }
  }

  return null;
};

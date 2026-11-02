const normalizarCep = (valor) => {
  const cep = String(valor || '').replace(/\D/g, '');
  return /^\d{8}$/.test(cep) ? cep : null;
};

export const criarPayloadCotacaoMelhorEnvio = ({ livro, vendedor, cepDestino }) => {
  const origem = normalizarCep(livro.localizacao) || normalizarCep(vendedor?.endereco?.cep);
  const destino = normalizarCep(cepDestino);
  if (!origem) {
    const erro = new Error('O vendedor precisa cadastrar um CEP de origem válido no perfil.');
    erro.status = 422;
    throw erro;
  }
  if (!destino) {
    const erro = new Error('Informe um CEP de entrega válido com 8 números.');
    erro.status = 400;
    throw erro;
  }

  const dimensoes = livro.dimensoes;
  if (
    !dimensoes ||
    !['altura', 'largura', 'comprimento', 'peso'].every(campo =>
      Number.isFinite(dimensoes[campo]) && dimensoes[campo] > 0
    )
  ) {
    const erro = new Error('Este livro ainda não tem dimensões de envio válidas cadastradas.');
    erro.status = 422;
    throw erro;
  }

  const valorSeguro = Number(livro.preco);
  if (!Number.isFinite(valorSeguro) || valorSeguro < 0) {
    const erro = new Error('O preço do livro precisa ser válido para calcular o seguro do envio.');
    erro.status = 422;
    throw erro;
  }

  return {
    from: { postal_code: origem },
    to: { postal_code: destino },
    products: [{
      id: String(livro.id || livro._id || 'livro'),
      width: dimensoes.largura,
      height: dimensoes.altura,
      length: dimensoes.comprimento,
      weight: dimensoes.peso / 1000,
      insurance_value: valorSeguro,
      quantity: 1
    }]
  };
};

export const normalizarCotacoesMelhorEnvio = (resposta) => {
  const cotacoes = Array.isArray(resposta)
    ? resposta
    : Array.isArray(resposta?.data)
      ? resposta.data
      : [];

  return cotacoes
    .filter(cotacao => !cotacao.error)
    .map(cotacao => ({
      codigoServico: String(cotacao.id || ''),
      nomeServico: [cotacao.company?.name, cotacao.name].filter(Boolean).join(' - ') || 'Opção de envio',
      valor: cotacao.custom_price ?? cotacao.price,
      prazoEntrega: cotacao.custom_delivery_time ?? cotacao.delivery_time
    }));
};

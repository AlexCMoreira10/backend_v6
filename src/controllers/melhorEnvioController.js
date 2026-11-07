import {
  calcularFreteMelhorEnvio,
  concluirAutorizacaoMelhorEnvio,
  consultarStatusMelhorEnvio,
  criarUrlAutorizacaoMelhorEnvio,
  rejeitarAutorizacaoMelhorEnvio
} from '../services/melhorEnvioService.js';

const redirecionarParaFrontend = (res, resultado) => {
  let urlFrontend;
  try {
    urlFrontend = new URL(process.env.PUBLIC_APP_URL);
    if (
      urlFrontend.protocol !== 'https:' &&
      !(urlFrontend.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(urlFrontend.hostname))
    ) {
      throw new Error('URL pública inválida');
    }
  } catch {
    return res
      .status(500)
      .type('text/plain')
      .send('Não foi possível retornar à plataforma. Verifique a configuração do frontend.');
  }

  const destino = new URL('/', urlFrontend);
  destino.searchParams.set('melhorEnvio', resultado);
  return res.redirect(303, destino.toString());
};

export const criarAutorizacaoMelhorEnvioController = async (req, res) => {
  try {
    const url = await criarUrlAutorizacaoMelhorEnvio(req.usuario.uid);
    return res.json({ url });
  } catch (error) {
    console.error('Não foi possível iniciar a autorização do Melhor Envio.');
    return res
      .status(error.status || 500)
      .json({ erro: error.status ? error.message : 'Não foi possível iniciar a autorização do Melhor Envio.' });
  }
};

export const redirecionarAutorizacaoMelhorEnvioController = async (req, res) => {
  try {
    const url = await criarUrlAutorizacaoMelhorEnvio(req.usuario.uid);
    return res.redirect(302, url);
  } catch (error) {
    console.error('Não foi possível iniciar a autorização do Melhor Envio.');
    return res
      .status(error.status || 500)
      .json({ erro: error.status ? error.message : 'Não foi possível iniciar a autorização do Melhor Envio.' });
  }
};

export const callbackMelhorEnvioController = async (req, res) => {
  if (req.query.error) {
    try {
      await rejeitarAutorizacaoMelhorEnvio(req.query.state);
    } catch {
      return redirecionarParaFrontend(res, 'erro');
    }
    return redirecionarParaFrontend(res, 'recusado');
  }

  try {
    await concluirAutorizacaoMelhorEnvio({
      code: req.query.code,
      state: req.query.state
    });
    return redirecionarParaFrontend(res, 'sucesso');
  } catch (error) {
    console.error('Não foi possível concluir a autorização do Melhor Envio.');
    return redirecionarParaFrontend(res, 'erro');
  }
};

export const consultarStatusMelhorEnvioController = async (req, res) => {
  try {
    const status = await consultarStatusMelhorEnvio(req.usuario.uid);
    return res.json(status);
  } catch (error) {
    console.error('Erro ao consultar conexão do Melhor Envio:', error);
    return res.status(500).json({ erro: 'Não foi possível consultar a conexão do Melhor Envio.' });
  }
};

export const calcularFreteMelhorEnvioController = async (req, res) => {
  const livroId = req.params.id || req.body?.livroId;
  if (
    typeof livroId !== 'string' ||
    !livroId.trim() ||
    livroId.length > 150 ||
    livroId.includes('/')
  ) {
    return res.status(400).json({ erro: 'Informe um livro válido para calcular o frete.' });
  }

  try {
    const resultado = await calcularFreteMelhorEnvio({
      livroId: livroId.trim(),
      cepDestino: req.body?.cepDestino
    });
    return res.json(resultado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Não foi possível consultar a cotação no Melhor Envio.');
    return res.status(502).json({ erro: 'Não foi possível consultar o Melhor Envio. Tente novamente.' });
  }
};

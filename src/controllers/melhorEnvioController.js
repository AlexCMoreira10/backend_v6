import {
  calcularFreteMelhorEnvio,
  concluirAutorizacaoMelhorEnvio,
  consultarStatusMelhorEnvio,
  criarUrlAutorizacaoMelhorEnvio
} from '../services/melhorEnvioService.js';

export const criarAutorizacaoMelhorEnvioController = async (req, res) => {
  try {
    const url = await criarUrlAutorizacaoMelhorEnvio(req.usuario.uid);
    return res.json({ url });
  } catch (error) {
    console.error('Erro ao iniciar autorização do Melhor Envio:', error);
    return res
      .status(error.status || 500)
      .json({ erro: error.status ? error.message : 'Não foi possível iniciar a autorização do Melhor Envio.' });
  }
};

export const callbackMelhorEnvioController = async (req, res) => {
  if (req.query.error) {
    return res
      .type('text/plain')
      .status(400)
      .send('A autorização do Melhor Envio foi recusada. Você pode fechar esta página.');
  }

  try {
    await concluirAutorizacaoMelhorEnvio({
      code: req.query.code,
      state: req.query.state
    });
    return res
      .type('text/plain')
      .status(200)
      .send('Conta do Melhor Envio conectada com sucesso. Você pode voltar para a Estante de Babel.');
  } catch (error) {
    console.error('Erro no callback de autorização do Melhor Envio:', error);
    return res
      .type('text/plain')
      .status(error.status || 500)
      .send(error.status
          ? error.message
          : 'Não foi possível concluir a autorização do Melhor Envio. Tente novamente.');
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
  try {
    const resultado = await calcularFreteMelhorEnvio({
      livroId: req.params.id,
      cepDestino: req.body?.cepDestino
    });
    return res.json(resultado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao calcular frete no Melhor Envio:', error);
    return res.status(502).json({ erro: 'Não foi possível consultar o Melhor Envio. Tente novamente.' });
  }
};

import {
  atualizarSebo as atualizarSeboService,
  buscarSeboPorId,
  cadastrarSebo as cadastrarSeboService,
  sincronizarLocalizacaoSebo
} from '../services/seboService.js';
import { validarCadastroSebo } from '../utils/seboValidation.js';

export const cadastrarSebo = async (req, res) => {
  const { sebo, erro } = validarCadastroSebo(req.body, req.usuario.email);
  if (erro) return res.status(400).json({ erro });

  try {
    const resultado = await cadastrarSeboService(req.usuario.uid, sebo);
    return res.status(201).json(resultado);
  } catch (error) {
    if (error.code === 'sebo/cnpj-already-exists') {
      return res.status(409).json({ erro: 'Este CNPJ já está cadastrado' });
    }
    if (error.code === 'sebo/already-exists') {
      return res.status(409).json({ erro: 'Já existe um cadastro de sebo para esta conta' });
    }
    if (error.status) return res.status(error.status).json({ erro: error.message });

    console.error('Erro ao cadastrar sebo:', error);
    return res.status(500).json({ erro: 'Erro ao cadastrar sebo' });
  }
};

export const buscarMeuSebo = async (req, res) => {
  try {
    const sebo = await buscarSeboPorId(req.usuario.uid);
    if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    return res.json(sebo);
  } catch (error) {
    console.error('Erro ao buscar cadastro do sebo:', error);
    return res.status(500).json({ erro: 'Erro ao buscar cadastro do sebo' });
  }
};

export const atualizarMeuSebo = async (req, res) => {
  try {
    const sebo = await atualizarSeboService(req.seboId, req.body);
    if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    return res.json(sebo);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ erro: error.message });
    console.error('Erro ao atualizar cadastro do sebo:', error);
    return res.status(500).json({ erro: 'Não foi possível atualizar o cadastro do sebo' });
  }
};

export const sincronizarLocalizacaoMeuSebo = async (req, res) => {
  try {
    const resultado = await sincronizarLocalizacaoSebo(req.seboId);
    if (!resultado) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    return res.json(resultado);
  } catch (error) {
    console.error('Erro ao retomar sincronização da localização do sebo:', error);
    return res.status(500).json({ erro: 'Não foi possível retomar a sincronização da localização' });
  }
};

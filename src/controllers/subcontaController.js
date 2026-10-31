import {
  autenticarSubconta as autenticarSubcontaService,
  atualizarSubconta as atualizarSubcontaService,
  buscarPerfilSubconta,
  buscarSubcontaPorUid,
  criarSubconta as criarSubcontaService,
  listarSubcontas as listarSubcontasService,
  redefinirSenhaSubconta as redefinirSenhaService,
  trocarMinhaSenha as trocarMinhaSenhaService
} from '../services/subcontaService.js';
import { buscarSeboPorId } from '../services/seboService.js';
import {
  validarAtualizacaoSubconta,
  validarDadosSubconta,
  validarSenhaTemporaria
} from '../utils/subcontaValidation.js';

const responderErroSubconta = (res, error, contexto) => {
  const conflitos = {
    'subconta/login-exists': 'Este login já está sendo usado',
    'subconta/phone-exists': 'Este telefone já está associado a outra subconta',
    'subconta/cpf-exists': 'Este CPF já está cadastrado',
    'subconta/identifier-conflict': 'O login e o telefone precisam ser diferentes'
  };
  if (conflitos[error.code]) return res.status(409).json({ erro: conflitos[error.code] });
  if (error.code === 'subconta/not-found') {
    return res.status(404).json({ erro: 'Subconta não encontrada para este sebo' });
  }
  if (error.code === 'subconta/inactive') {
    return res.status(409).json({ erro: error.message });
  }

  console.error(contexto, error);
  return res.status(500).json({ erro: 'Não foi possível concluir a operação de subconta' });
};

export const autenticarSubconta = async (req, res) => {
  const { identificador, senha } = req.body || {};
  if (
    typeof identificador !== 'string' ||
    !identificador.trim() ||
    typeof senha !== 'string' ||
    !senha
  ) {
    return res.status(400).json({ erro: 'Informe seu login ou telefone e a senha' });
  }

  try {
    const resultado = await autenticarSubcontaService(identificador, senha);
    return res.json(resultado);
  } catch (error) {
    if (error.code === 'auth/invalid-credentials') {
      return res.status(401).json({ erro: 'Login ou senha inválidos' });
    }
    console.error('Erro ao autenticar subconta:', error);
    return res.status(500).json({ erro: 'Não foi possível entrar. Tente novamente.' });
  }
};

export const listarSubcontas = async (req, res) => {
  try {
    const resultado = await listarSubcontasService(req.seboId);
    return res.json({ subcontas: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao listar subcontas:');
  }
};

export const criarSubconta = async (req, res) => {
  const { subconta, erro } = validarDadosSubconta(req.body);
  if (erro) return res.status(400).json({ erro });

  try {
    const resultado = await criarSubcontaService(req.seboId, subconta);
    return res.status(201).json({ subconta: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao criar subconta:');
  }
};

export const atualizarSubconta = async (req, res) => {
  const { atualizacao, erro } = validarAtualizacaoSubconta(req.body);
  if (erro) return res.status(400).json({ erro });

  try {
    const resultado = await atualizarSubcontaService(req.seboId, req.params.id, atualizacao);
    return res.json({ subconta: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao atualizar subconta:');
  }
};

export const revogarSubconta = async (req, res) => {
  try {
    const resultado = await atualizarSubcontaService(req.seboId, req.params.id, {
      ativo: false
    });
    return res.json({ subconta: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao revogar subconta:');
  }
};

export const redefinirSenhaSubconta = async (req, res) => {
  const senhaTemporaria = req.body?.senhaTemporaria;
  if (!validarSenhaTemporaria(senhaTemporaria)) {
    return res.status(400).json({
      erro: 'A senha temporária deve ter entre 10 e 128 caracteres'
    });
  }

  try {
    const resultado = await redefinirSenhaService(
      req.seboId,
      req.params.id,
      senhaTemporaria
    );
    return res.json({ subconta: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao redefinir senha da subconta:');
  }
};

export const trocarMinhaSenha = async (req, res) => {
  const novaSenha = req.body?.novaSenha;
  if (!validarSenhaTemporaria(novaSenha)) {
    return res.status(400).json({ erro: 'A nova senha deve ter entre 10 e 128 caracteres' });
  }

  try {
    const resultado = await trocarMinhaSenhaService(req.subconta._id, novaSenha);
    return res.json({ subconta: resultado });
  } catch (error) {
    return responderErroSubconta(res, error, 'Erro ao trocar senha da subconta:');
  }
};

export const buscarMeuSebo = async (req, res) => {
  try {
    if (req.subconta) {
      const sebo = await buscarSeboPorId(req.seboId);
      if (!sebo) return res.status(404).json({ erro: 'Sebo não encontrado' });
      return res.json({
        tipoConta: 'subconta',
        seboId: req.seboId,
        seboNome: sebo.nome,
        ...buscarPerfilSubconta(req.subconta)
      });
    }

    const sebo = await buscarSeboPorId(req.seboId);
    if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
    return res.json(sebo);
  } catch (error) {
    console.error('Erro ao buscar perfil do sebo:', error);
    return res.status(500).json({ erro: 'Erro ao buscar perfil do sebo' });
  }
};

export const buscarMinhaSubconta = async (req, res) => {
  try {
    const registro = await buscarSubcontaPorUid(req.usuario.uid);
    if (!registro || registro.seboId !== req.seboId) {
      return res.status(404).json({ erro: 'Subconta não encontrada' });
    }
    return res.json({ subconta: buscarPerfilSubconta(registro) });
  } catch (error) {
    console.error('Erro ao buscar subconta autenticada:', error);
    return res.status(500).json({ erro: 'Erro ao buscar subconta' });
  }
};

export const buscarMinhaSessao = async (req, res) => {
  try {
    if (!req.subconta) {
      const sebo = await buscarSeboPorId(req.seboId);
      if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });
      return res.json({ ...sebo, tipoConta: 'gestor', seboId: req.seboId });
    }

    const sebo = await buscarSeboPorId(req.seboId);
    if (!sebo) return res.status(404).json({ erro: 'Sebo não encontrado' });
    return res.json({
      tipoConta: 'subconta',
      seboId: req.seboId,
      seboNome: sebo.nome,
      ...buscarPerfilSubconta({
        ...req.subconta,
        _id: req.usuario.staffId
      })
    });
  } catch (error) {
    console.error('Erro ao buscar sessão do sebo:', error);
    return res.status(500).json({ erro: 'Erro ao buscar sessão do sebo' });
  }
};

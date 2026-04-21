import { salvarUsuarioSeNaoExistir } from '../services/userService.js';

export const criarOuBuscarUsuario = async (req, res) => {
  try {
    const usuario = {
      uid: req.usuario.uid,
      nome: req.usuario.name || '',
      email: req.usuario.email || '',
      foto: req.usuario.picture || '',
      criadoEm: new Date()
    };

    const resultado = await salvarUsuarioSeNaoExistir(usuario);

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao salvar usuário' });
  }
};
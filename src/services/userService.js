import admin, { db } from '../config/firebase.js';

const collection = db.collection('users');

export const salvarUsuarioSeNaoExistir = async (usuario) => {
  const docRef = collection.doc(usuario.uid);
  const doc = await docRef.get();

  if (!doc.exists) {
    await docRef.set(usuario);
    return {
      id: docRef.id,
      ...usuario
    };
  }

  return {
    id: doc.id,
    ...doc.data()
  };
};

export const cadastrarUsuario = async ({ senha, ...dadosUsuario }) => {
  const usuarioAuth = await admin.auth().createUser({
    email: dadosUsuario.email,
    password: senha,
    displayName: dadosUsuario.nome
  });

  const usuario = {
    _id: usuarioAuth.uid,
    uid: usuarioAuth.uid,
    ...dadosUsuario,
    foto: '',
    transacoes: {
      total: 0,
      compras: 0,
      vendas: 0,
      trocas: 0,
      doacoes_enviadas: 0,
      doacoes_recebidas: 0
    },
    limite_doacoes: {
      recebidas: 1,
      utilizadas: 0,
      disponiveis: 1
    },
    criadoEm: new Date()
  };
  const docRef = collection.doc(usuarioAuth.uid);

  try {
    await docRef.set(usuario);
  } catch (error) {
    try {
      await admin.auth().deleteUser(usuarioAuth.uid);
    } catch (cleanupError) {
      console.error('Não foi possível remover a conta após falha ao salvar o perfil:', cleanupError);
    }

    throw error;
  }

  return {
    id: docRef.id,
    ...usuario
  };
};

export const buscarUsuarioPorId = async (uid) => {
  const docRef = collection.doc(uid);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};
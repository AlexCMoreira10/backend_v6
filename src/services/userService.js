import admin, { db } from '../config/firebase.js';
import { geocodificarEndereco } from './geocodingService.js';
import {
  criarDadosLocalizacaoAnuncio,
  mesmoEnderecoLocalizacao,
  mesmoGeocode
} from '../utils/profileLocation.js';

const collection = db.collection('users');
const TAMANHO_LOTE_LOCALIZACAO = 400;

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

export const sincronizarLocalizacaoAnuncios = async (uid) => {
  const perfilRef = collection.doc(uid);
  const perfilSnapshot = await perfilRef.get();
  if (!perfilSnapshot.exists) return null;

  const perfil = perfilSnapshot.data();
  const versao = Number(perfil.localizacaoVersao) || 0;
  const dadosLocalizacao = criarDadosLocalizacaoAnuncio(perfil, versao);
  const anunciosSnapshot = await db.collection('livros')
    .where('usuarioId', '==', uid)
    .get();
  const anuncios = anunciosSnapshot.docs.filter(doc => !doc.data().seboId);

  for (let inicio = 0; inicio < anuncios.length; inicio += TAMANHO_LOTE_LOCALIZACAO) {
    const lote = db.batch();
    anuncios
      .slice(inicio, inicio + TAMANHO_LOTE_LOCALIZACAO)
      .forEach(doc => {
        const { geocode, ...atualizacao } = dadosLocalizacao;
        if (geocode) atualizacao.geocode = geocode;
        else atualizacao.geocode = admin.firestore.FieldValue.delete();
        lote.update(doc.ref, atualizacao);
      });
    await lote.commit();
  }

  const sincronizacaoConcluida = await db.runTransaction(async transaction => {
    const atual = await transaction.get(perfilRef);
    if (
      atual.exists &&
      (Number(atual.data().localizacaoVersao) || 0) === versao
    ) {
      transaction.update(perfilRef, {
        localizacaoSyncStatus: 'sincronizado',
        localizacaoSyncAtualizadoEm: new Date()
      });
      return true;
    }
    return false;
  });

  return {
    status: sincronizacaoConcluida ? 'sincronizado' : 'pendente',
    anunciosAtualizados: anuncios.length,
    geocodeDisponivel: Boolean(dadosLocalizacao.geocode)
  };
};

export const atualizarPerfilUsuario = async (uid, dadosPerfil) => {
  const docRef = collection.doc(uid);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const perfilAnterior = doc.data();
  const perfilAtualizado = { ...dadosPerfil };
  const enderecoMudou = Object.hasOwn(perfilAtualizado, 'endereco') &&
    !mesmoEnderecoLocalizacao(perfilAnterior.endereco, perfilAtualizado.endereco);
  let avisoLocalizacao = null;

  if (enderecoMudou) {
    try {
      const resultadoGeocodificacao = await geocodificarEndereco(perfilAtualizado.endereco);
      perfilAtualizado.geocode = resultadoGeocodificacao.geocode;
      avisoLocalizacao = resultadoGeocodificacao.aviso;
    } catch (error) {
      console.error('Falha ao geocodificar o endereço do perfil:', error);
      perfilAtualizado.geocode = null;
      avisoLocalizacao = 'Não foi possível obter coordenadas confiáveis para o novo endereço. As coordenadas antigas serão removidas dos anúncios.';
    }
  }

  const localizacaoMudou = enderecoMudou ||
    (Object.hasOwn(perfilAtualizado, 'geocode') &&
      !mesmoGeocode(perfilAnterior.geocode, perfilAtualizado.geocode));
  const versaoLocalizacao = localizacaoMudou
    ? (Number(perfilAnterior.localizacaoVersao) || 0) + 1
    : Number(perfilAnterior.localizacaoVersao) || 0;
  const atualizadoEm = new Date();

  await admin.auth().updateUser(uid, { displayName: perfilAtualizado.nome });
  await docRef.update({
    ...perfilAtualizado,
    ...(localizacaoMudou
      ? {
          localizacaoVersao: versaoLocalizacao,
          localizacaoSyncStatus: 'pendente',
          localizacaoSyncAtualizadoEm: atualizadoEm
        }
      : {}),
    atualizadoEm
  });

  let sincronizacaoLocalizacao = {
    status: perfilAnterior.localizacaoSyncStatus || 'sincronizado',
    anunciosAtualizados: 0
  };
  if (localizacaoMudou) {
    try {
      sincronizacaoLocalizacao = await sincronizarLocalizacaoAnuncios(uid);
    } catch (error) {
      console.error('Falha ao sincronizar localização dos anúncios:', error);
      avisoLocalizacao = 'O perfil foi atualizado, mas a localização dos anúncios ainda está pendente. Use a opção de sincronização para tentar novamente.';
      sincronizacaoLocalizacao = {
        status: 'pendente',
        anunciosAtualizados: 0
      };
    }
  }

  return {
    id: doc.id,
    ...perfilAnterior,
    ...perfilAtualizado,
    localizacaoVersao: versaoLocalizacao,
    localizacaoSyncStatus: sincronizacaoLocalizacao.status,
    sincronizacaoLocalizacao,
    ...(avisoLocalizacao ? { avisoLocalizacao } : {}),
    atualizadoEm
  };
};
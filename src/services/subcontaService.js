import { randomUUID } from 'node:crypto';
import admin, { db } from '../config/firebase.js';
import {
  criptografarCpf,
  formatarCpfMascarado,
  gerarIndiceCpf,
  hashearSenha,
  verificarSenha
} from '../utils/subcontaSecurity.js';
import {
  normalizarCpf,
  normalizarLogin,
  normalizarTelefone
} from '../utils/subcontaValidation.js';

const sebos = db.collection('sebos');
const subcontas = db.collection('sebo_subcontas');
const identificadores = db.collection('sebo_subcontas_identificadores');
const cpfs = db.collection('sebo_subcontas_cpfs');

const criarErro = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const resumirSubconta = (id, dados) => ({
  id,
  uid: dados.uid,
  nome: dados.nome,
  login: dados.login,
  telefone: dados.telefone,
  cpf: dados.cpfMascarado,
  tipo: dados.tipo,
  permissoes: dados.permissoes,
  ativo: dados.ativo,
  precisaTrocarSenha: dados.precisaTrocarSenha,
  criadoEm: dados.criadoEm,
  atualizadoEm: dados.atualizadoEm
});

export const listarSubcontas = async (seboId) => {
  const snapshot = await subcontas.where('seboId', '==', seboId).get();
  return snapshot.docs
    .map((doc) => resumirSubconta(doc.id, doc.data()))
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
};

export const criarSubconta = async (seboId, dados) => {
  const id = randomUUID();
  const uid = `sebo-staff-${id}`;
  const cpf = normalizarCpf(dados.cpf);
  const telefone = normalizarTelefone(dados.telefone);
  const [credencial, cpfCriptografado] = await Promise.all([
    hashearSenha(dados.senhaTemporaria),
    Promise.resolve(criptografarCpf(cpf))
  ]);
  const seboRef = sebos.doc(seboId);
  const subcontaRef = subcontas.doc(id);
  const loginRef = identificadores.doc(normalizarLogin(dados.login));
  const cpfRef = cpfs.doc(gerarIndiceCpf(cpf));
  const telefoneRef = telefone ? identificadores.doc(telefone) : null;

  const resultado = await db.runTransaction(async (transaction) => {
    const refs = [seboRef, loginRef, cpfRef, ...(telefoneRef ? [telefoneRef] : [])];
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const [seboDoc, loginDoc, cpfDoc, telefoneDoc] = snapshots;

    if (!seboDoc.exists) throw criarErro('sebo/not-found', 'Sebo não encontrado');
    if (loginDoc.exists) throw criarErro('subconta/login-exists', 'Este login já está sendo usado');
    if (cpfDoc.exists) throw criarErro('subconta/cpf-exists', 'Este CPF já está cadastrado');
    if (telefoneDoc?.exists) {
      throw criarErro('subconta/phone-exists', 'Este telefone já está associado a outra subconta');
    }

    const agora = new Date();
    const registro = {
      _id: id,
      uid,
      seboId,
      nome: dados.nome,
      login: normalizarLogin(dados.login),
      telefone: telefone || null,
      cpfCriptografado,
      cpfMascarado: formatarCpfMascarado(cpf),
      tipo: dados.tipo,
      permissoes: dados.permissoes,
      credencial,
      ativo: true,
      precisaTrocarSenha: true,
      criadoEm: agora,
      atualizadoEm: agora
    };

    transaction.create(subcontaRef, registro);
    transaction.create(loginRef, { seboId, subcontaId: id, tipo: 'login' });
    transaction.create(cpfRef, { seboId, subcontaId: id });
    if (telefoneRef) {
      transaction.create(telefoneRef, { seboId, subcontaId: id, tipo: 'telefone' });
    }
    return resumirSubconta(id, registro);
  });

  return resultado;
};

export const autenticarSubconta = async (identificador, senha) => {
  const texto = String(identificador ?? '').trim();
  const numeroTelefone = normalizarTelefone(texto);
  const identificadorEhTelefone = /^\+?[\d\s().-]+$/.test(texto) &&
    [10, 11].includes(numeroTelefone.length);
  const valorIdentificador = identificadorEhTelefone
    ? numeroTelefone
    : normalizarLogin(texto);
  const indiceRef = identificadores.doc(valorIdentificador);
  const indice = await indiceRef.get();
  const registroRef = indice.exists
    ? subcontas.doc(indice.data().subcontaId)
    : null;
  const registro = registroRef ? await registroRef.get() : null;
  const dados = registro?.exists ? registro.data() : null;

  if (
    !dados ||
    !dados.ativo ||
    (dados.login !== valorIdentificador && dados.telefone !== valorIdentificador) ||
    !await verificarSenha(String(senha ?? ''), dados.credencial)
  ) {
    throw criarErro('auth/invalid-credentials', 'Login ou senha inválidos');
  }

  const customToken = await admin.auth().createCustomToken(dados.uid, {
    accountType: 'sebo_staff',
    seboId: dados.seboId,
    staffId: registro.id
  });

  return {
    customToken,
    subconta: resumirSubconta(registro.id, dados)
  };
};

export const buscarSubcontaPorUid = async (uid) => {
  const resultado = await subcontas.where('uid', '==', uid).limit(1).get();
  return resultado.empty
    ? null
    : { id: resultado.docs[0].id, ...resultado.docs[0].data() };
};

export const atualizarSubconta = async (seboId, subcontaId, atualizacao) => {
  const subcontaRef = subcontas.doc(subcontaId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(subcontaRef);
    if (!snapshot.exists || snapshot.data().seboId !== seboId) {
      throw criarErro('subconta/not-found', 'Subconta não encontrada');
    }

    const atual = snapshot.data();
    const login = atualizacao.login ?? atual.login;
    const telefone = atualizacao.telefone === undefined
      ? atual.telefone
      : normalizarTelefone(atualizacao.telefone);
    const loginNormalizado = normalizarLogin(login);
    if (telefone && telefone === loginNormalizado) {
      throw criarErro('subconta/identifier-conflict', 'O login e o telefone precisam ser diferentes');
    }
    const loginAnteriorRef = identificadores.doc(atual.login);
    const loginNovoRef = identificadores.doc(loginNormalizado);
    const telefoneAnteriorRef = atual.telefone ? identificadores.doc(atual.telefone) : null;
    const telefoneNovoRef = telefone ? identificadores.doc(telefone) : null;
    const refs = [...new Map([
      loginAnteriorRef,
      loginNovoRef,
      ...(telefoneAnteriorRef ? [telefoneAnteriorRef] : []),
      ...(telefoneNovoRef ? [telefoneNovoRef] : [])
    ].map((ref) => [ref.path, ref])).values()];
    const indices = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const porCaminho = new Map(refs.map((ref, indice) => [ref.path, indices[indice]]));

    const loginExistente = porCaminho.get(loginNovoRef.path);
    if (loginExistente?.exists && loginExistente.data().subcontaId !== subcontaId) {
      throw criarErro('subconta/login-exists', 'Este login já está sendo usado');
    }

    const telefoneExistente = telefoneNovoRef
      ? porCaminho.get(telefoneNovoRef.path)
      : null;
    if (telefoneExistente?.exists && telefoneExistente.data().subcontaId !== subcontaId) {
      throw criarErro('subconta/phone-exists', 'Este telefone já está associado a outra subconta');
    }

    const agora = new Date();
    const proximo = {
      ...atual,
      ...atualizacao,
      login: normalizarLogin(login),
      telefone: telefone || null,
      atualizadoEm: agora
    };

    if (atual.login !== proximo.login) {
      transaction.delete(loginAnteriorRef);
      transaction.set(loginNovoRef, { seboId, subcontaId, tipo: 'login' });
    }
    if (atual.telefone !== proximo.telefone) {
      if (telefoneAnteriorRef) transaction.delete(telefoneAnteriorRef);
      if (telefoneNovoRef) {
        transaction.set(telefoneNovoRef, { seboId, subcontaId, tipo: 'telefone' });
      }
    }
    transaction.set(subcontaRef, proximo);
    return resumirSubconta(subcontaId, proximo);
  });
};

export const redefinirSenhaSubconta = async (seboId, subcontaId, senhaTemporaria) => {
  const subcontaRef = subcontas.doc(subcontaId);
  const credencial = await hashearSenha(senhaTemporaria);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(subcontaRef);
    if (!snapshot.exists || snapshot.data().seboId !== seboId) {
      throw criarErro('subconta/not-found', 'Subconta não encontrada');
    }
    if (!snapshot.data().ativo) {
      throw criarErro('subconta/inactive', 'Reative a subconta antes de redefinir a senha');
    }

    const proximo = {
      ...snapshot.data(),
      credencial,
      precisaTrocarSenha: true,
      atualizadoEm: new Date()
    };
    transaction.set(subcontaRef, proximo);
    return resumirSubconta(subcontaId, proximo);
  });
};

export const trocarMinhaSenha = async (subcontaId, senha) => {
  const subcontaRef = subcontas.doc(subcontaId);
  const credencial = await hashearSenha(senha);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(subcontaRef);
    if (!snapshot.exists || !snapshot.data().ativo) {
      throw criarErro('subconta/not-found', 'Subconta ativa não encontrada');
    }

    const proximo = {
      ...snapshot.data(),
      credencial,
      precisaTrocarSenha: false,
      atualizadoEm: new Date()
    };
    transaction.set(subcontaRef, proximo);
    return resumirSubconta(subcontaId, proximo);
  });
};

export const buscarPerfilSubconta = (dados) => ({
  id: dados._id,
  uid: dados.uid,
  seboId: dados.seboId,
  nome: dados.nome,
  login: dados.login,
  telefone: dados.telefone,
  cpf: dados.cpfMascarado,
  tipo: dados.tipo,
  permissoes: dados.permissoes,
  ativo: dados.ativo,
  precisaTrocarSenha: dados.precisaTrocarSenha
});

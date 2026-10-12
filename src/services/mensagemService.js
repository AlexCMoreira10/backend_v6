import { db } from '../config/firebase.js';

const collection = db.collection('mensagens');

const converterData = (data) => {
  if (data && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  return new Date(data).toISOString();
};

const converterMensagem = (doc) => {
  const dados = doc.data();

  return {
    id: doc.id,
    id_remetente: dados.id_remetente,
    id_destinatario: dados.id_destinatario,
    conteudo: dados.conteudo,
    data_envio: converterData(dados.data_envio),
    lida: dados.lida ?? false
  };
};

const ordenarPorData = (mensagemA, mensagemB, ordem = 'asc') => {
  const diferenca =
    new Date(mensagemA.data_envio).getTime() -
    new Date(mensagemB.data_envio).getTime();

  if (diferenca !== 0) {
    return ordem === 'asc' ? diferenca : -diferenca;
  }

  return ordem === 'asc'
    ? mensagemA.id.localeCompare(mensagemB.id)
    : mensagemB.id.localeCompare(mensagemA.id);
};

const buscarMensagens = async (campo, valor) => {
  const snapshot = await collection
    .where(campo, '==', valor)
    .get();

  return snapshot.docs.map(converterMensagem);
};

const buscarMensagensDaConversa = async (idUsuario, idOutroUsuario) => {
  const [enviadasSnapshot, recebidasSnapshot] = await Promise.all([
    collection
      .where('id_remetente', '==', idUsuario)
      .where('id_destinatario', '==', idOutroUsuario)
      .get(),
    collection
      .where('id_remetente', '==', idOutroUsuario)
      .where('id_destinatario', '==', idUsuario)
      .get()
  ]);

  return [
    ...enviadasSnapshot.docs.map(converterMensagem),
    ...recebidasSnapshot.docs.map(converterMensagem)
  ];
};

export const criarMensagem = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
  };
};

export const listarMensagensDoUsuario = async (idUsuario) => {
  const [enviadas, recebidas] = await Promise.all([
    buscarMensagens('id_remetente', idUsuario),
    buscarMensagens('id_destinatario', idUsuario)
  ]);

  const mensagensUnicas = new Map(
    [...enviadas, ...recebidas].map((mensagem) => [mensagem.id, mensagem])
  );

  return [...mensagensUnicas.values()]
    .sort((a, b) => ordenarPorData(a, b, 'desc'));
};

export const listarConversasDoUsuario = async (idUsuario) => {
  const mensagens = await listarMensagensDoUsuario(idUsuario);
  const conversas = new Map();

  for (const mensagem of mensagens) {
    const outroUsuarioId = mensagem.id_remetente === idUsuario
      ? mensagem.id_destinatario
      : mensagem.id_remetente;
    const conversa = conversas.get(outroUsuarioId) ?? {
      idUsuario: outroUsuarioId,
      ultima_mensagem: mensagem,
      mensagens_nao_lidas: 0
    };

    if (
      mensagem.id_destinatario === idUsuario &&
      mensagem.lida === false
    ) {
      conversa.mensagens_nao_lidas += 1;
    }

    conversas.set(outroUsuarioId, conversa);
  }

  const idsUsuarios = [...conversas.keys()];
  const usuarios = idsUsuarios.length
    ? await db.getAll(...idsUsuarios.map((id) => db.collection('users').doc(id)))
    : [];
  const usuariosPorId = new Map(
    usuarios.map((usuario) => [usuario.id, usuario.exists ? usuario.data() : {}])
  );

  return [...conversas.values()]
    .map(({ idUsuario: outroUsuarioId, ultima_mensagem, mensagens_nao_lidas }) => {
      const usuario = usuariosPorId.get(outroUsuarioId) ?? {};

      return {
        outro_participante: {
          id: outroUsuarioId,
          nome: usuario.nome || usuario.name || '',
          foto: usuario.foto || usuario.picture || ''
        },
        ultima_mensagem,
        mensagens_nao_lidas
      };
    })
    .sort((a, b) => ordenarPorData(b.ultima_mensagem, a.ultima_mensagem));
};

export const listarMensagensDaConversa = async (
  idUsuario,
  idOutroUsuario,
  pagina,
  limite
) => {
  const mensagens = (await buscarMensagensDaConversa(idUsuario, idOutroUsuario))
    .sort((a, b) => ordenarPorData(a, b));
  const inicio = (pagina - 1) * limite;

  return {
    mensagens: mensagens.slice(inicio, inicio + limite),
    paginacao: {
      pagina,
      limite,
      total: mensagens.length,
      total_paginas: Math.ceil(mensagens.length / limite)
    }
  };
};

export const marcarMensagemComoLida = async (id, idDestinatario) => {
  const referencia = collection.doc(id);

  return db.runTransaction(async (transacao) => {
    const documento = await transacao.get(referencia);

    if (!documento.exists) {
      return 'nao_encontrada';
    }

    if (documento.data().id_destinatario !== idDestinatario) {
      return 'sem_permissao';
    }

    transacao.update(referencia, { lida: true });
    return 'atualizada';
  });
};

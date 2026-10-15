import { randomBytes } from 'node:crypto';
import { db } from '../config/firebase.js';
import { criarUrlRastreio } from './qrCodeService.js';

const livros = db.collection('livros');
const notificacoes = db.collection('notificacoes');
const TIPOS_NEGOCIACAO = ['venda', 'troca', 'doacao'];

const falhar = (status, mensagem) => {
  const erro = new Error(mensagem);
  erro.status = status;
  throw erro;
};

const novoTokenQr = () => randomBytes(24).toString('base64url');
const paraData = (valor) => (
  valor && typeof valor.toDate === 'function' ? valor.toDate() : new Date(valor)
);

export const buscarRastreioPorToken = async (token) => {
  const snapshot = await livros.where('qrToken', '==', token).limit(1).get();

  if (snapshot.empty) return null;

  const livroDoc = snapshot.docs[0];
  const livro = { id: livroDoc.id, ...livroDoc.data() };
  const [posseSnapshot, negociacoesSnapshot, avaliacoesSnapshot] = await Promise.all([
    livroDoc.ref.collection('historicoPosse').get(),
    livroDoc.ref.collection('historicoNegociacoes').get(),
    livroDoc.ref.collection('avaliacoes').get()
  ]);

  const ordenarPorData = (itens, campo) =>
    itens.sort((a, b) => paraData(a[campo]).getTime() - paraData(b[campo]).getTime());

  delete livro.qrToken;
  delete livro.transferenciaPendente;

  return {
    livro,
    historicoPosse: ordenarPorData(
      posseSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      'dataInicio'
    ),
    historicoNegociacoes: ordenarPorData(
      negociacoesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      'dataConcluida'
    ),
    avaliacoes: ordenarPorData(
      avaliacoesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      'criadoEm'
    )
  };
};

export const solicitarAquisicaoPorToken = async (
  token,
  usuarioId,
  usuarioNome,
  tipoNegociacao
) => {
  const snapshot = await livros.where('qrToken', '==', token).limit(1).get();
  if (snapshot.empty) falhar(404, 'Livro não encontrado');

  return solicitarAquisicao(
    snapshot.docs[0].id,
    usuarioId,
    usuarioNome,
    tipoNegociacao
  );
};

export const solicitarAquisicao = async (livroId, usuarioId, usuarioNome, tipoNegociacao) => {
  if (!TIPOS_NEGOCIACAO.includes(tipoNegociacao)) {
    falhar(400, 'Tipo de negociação inválido');
  }

  const ref = livros.doc(livroId);
  const solicitadaEm = new Date();
  const notificacaoRef = notificacoes.doc();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = snapshot.data();
    if (livro.usuarioId === usuarioId) {
      falhar(400, 'Você já é o proprietário deste livro');
    }
    if (livro.status !== 'disponivel') {
      falhar(409, 'Este livro não está disponível para aquisição');
    }
    if (livro.estadoAcervo === 'roubado') {
      falhar(409, 'Este livro foi marcado como roubado e não pode ser transferido');
    }
    if (livro.transferenciaPendente) {
      falhar(409, 'Já existe uma aquisição pendente para este livro');
    }

    const transferenciaPendente = {
      solicitanteId: usuarioId,
      solicitanteNome: usuarioNome,
      proprietarioAnteriorId: livro.usuarioId,
      proprietarioAnteriorNome: livro.usuarioNome || '',
      tipoNegociacao,
      solicitadaEm
    };

    transaction.update(ref, { transferenciaPendente });
    transaction.set(notificacaoRef, {
      usuarioId: livro.usuarioId,
      mensagem: 'Você recebeu um pedido de aquisição de um livro',
      tipo: 'aquisicao',
      lida: false,
      criadoEm: solicitadaEm
    });
    return { livroId, ...transferenciaPendente };
  });
};

export const confirmarAquisicao = async (livroId, proprietarioId) => {
  const ref = livros.doc(livroId);
  const posseRef = ref.collection('historicoPosse').doc();
  const negociacaoRef = ref.collection('historicoNegociacoes').doc();
  const dataConcluida = new Date();
  const notificacaoRef = notificacoes.doc();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = snapshot.data();
    const transferencia = livro.transferenciaPendente;

    if (livro.usuarioId !== proprietarioId) {
      falhar(403, 'Somente o proprietário atual pode confirmar a aquisição');
    }
    if (!transferencia) {
      falhar(409, 'Não há aquisição pendente para este livro');
    }
    if (transferencia.proprietarioAnteriorId !== proprietarioId) {
      falhar(409, 'O proprietário do livro mudou; solicite a aquisição novamente');
    }
    if (livro.status !== 'disponivel') {
      falhar(409, 'A disponibilidade do livro mudou; a transferência não foi concluída');
    }
    if (livro.estadoAcervo === 'roubado') {
      falhar(409, 'Este livro foi marcado como roubado e não pode ser transferido');
    }

    const negociacao = {
      tipoNegociacao: transferencia.tipoNegociacao,
      proprietarioAnteriorId: proprietarioId,
      proprietarioAnteriorNome: transferencia.proprietarioAnteriorNome,
      novoProprietarioId: transferencia.solicitanteId,
      novoProprietarioNome: transferencia.solicitanteNome,
      solicitadaEm: transferencia.solicitadaEm,
      dataConcluida
    };

    transaction.update(ref, {
      usuarioId: transferencia.solicitanteId,
      usuarioNome: transferencia.solicitanteNome,
      status: 'na_estante',
      transferenciaPendente: null
    });
    transaction.set(posseRef, {
      usuarioId: transferencia.solicitanteId,
      nome: transferencia.solicitanteNome,
      proprietarioAnteriorId: proprietarioId,
      proprietarioAnteriorNome: transferencia.proprietarioAnteriorNome,
      tipoNegociacao: transferencia.tipoNegociacao,
      dataInicio: dataConcluida
    });
    transaction.set(negociacaoRef, negociacao);
    transaction.set(notificacaoRef, {
      usuarioId: transferencia.solicitanteId,
      mensagem: 'Sua aquisição foi confirmada; o livro está na sua estante',
      tipo: 'aquisicao',
      lida: false,
      criadoEm: dataConcluida
    });

    return { livroId, ...negociacao };
  });
};

export const recusarAquisicao = async (livroId, proprietarioId) => {
  const ref = livros.doc(livroId);
  const notificacaoRef = notificacoes.doc();
  const recusadaEm = new Date();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = snapshot.data();
    if (livro.usuarioId !== proprietarioId) {
      falhar(403, 'Somente o proprietário atual pode recusar a aquisição');
    }
    if (!livro.transferenciaPendente) {
      falhar(409, 'Não há aquisição pendente para este livro');
    }

    transaction.update(ref, { transferenciaPendente: null });
    transaction.set(notificacaoRef, {
      usuarioId: livro.transferenciaPendente.solicitanteId,
      mensagem: 'O proprietário recusou o pedido de aquisição do livro',
      tipo: 'aquisicao',
      lida: false,
      criadoEm: recusadaEm
    });
    return { mensagem: 'Aquisição recusada' };
  });
};

export const registrarAvaliacao = async (livroId, usuarioId, comentario) => {
  const livroRef = livros.doc(livroId);
  const avaliacaoRef = livroRef.collection('avaliacoes').doc(usuarioId);
  const historicoRef = livroRef.collection('historicoPosse');

  return db.runTransaction(async (transaction) => {
    const [livroSnapshot, avaliacaoSnapshot, posseSnapshot] = await Promise.all([
      transaction.get(livroRef),
      transaction.get(avaliacaoRef),
      transaction.get(historicoRef.where('usuarioId', '==', usuarioId).limit(1))
    ]);

    if (!livroSnapshot.exists) falhar(404, 'Livro não encontrado');
    if (posseSnapshot.empty) {
      falhar(403, 'Somente quem já teve este livro pode avaliá-lo');
    }
    if (avaliacaoSnapshot.exists) {
      falhar(409, 'Você já avaliou este livro');
    }

    const avaliacao = {
      usuarioId,
      comentario: comentario.trim(),
      criadoEm: new Date()
    };
    transaction.set(avaliacaoRef, avaliacao);
    return { id: usuarioId, ...avaliacao };
  });
};

export const marcarEstadoAcervo = async (livroId, usuarioId, estado) => {
  if (!['roubado', 'danificado'].includes(estado)) {
    falhar(400, 'Estado inválido; use "roubado" ou "danificado"');
  }

  const ref = livros.doc(livroId);
  const atualizadoEm = new Date();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = snapshot.data();
    if (livro.usuarioId !== usuarioId) {
      falhar(403, 'Somente o proprietário atual pode atualizar o estado do livro');
    }
    if (livro.estadoAcervo && livro.estadoAcervo !== 'normal') {
      falhar(409, 'O livro já possui um estado registrado');
    }

    transaction.update(ref, {
      estadoAcervo: estado,
      estadoAcervoAtualizadoEm: atualizadoEm,
      ...(estado === 'roubado' ? { transferenciaPendente: null } : {})
    });
    if (estado === 'roubado' && livro.transferenciaPendente) {
      transaction.set(notificacoes.doc(), {
        usuarioId: livro.transferenciaPendente.solicitanteId,
        mensagem: 'O pedido de aquisição foi cancelado porque o livro foi marcado como roubado',
        tipo: 'aquisicao',
        lida: false,
        criadoEm: atualizadoEm
      });
    }
    return { id: livroId, estadoAcervo: estado, estadoAcervoAtualizadoEm: atualizadoEm };
  });
};

export const garantirQrCodeLivro = async (livroId) => {
  const ref = livros.doc(livroId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = snapshot.data();
    if (livro.qrToken && livro.qrUrl) {
      return { qrUrl: livro.qrUrl };
    }

    const qrToken = novoTokenQr();
    const qrUrl = criarUrlRastreio(qrToken);
    transaction.update(ref, { qrToken, qrUrl });
    return { qrUrl };
  });
};

export const listarEstantePorUsuario = async (usuarioId, filtros) => {
  const snapshot = await livros.where('usuarioId', '==', usuarioId).get();
  let dados = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (filtros.estadoAcervo) {
    dados = dados.filter((livro) => livro.estadoAcervo === filtros.estadoAcervo);
  }
  if (filtros.titulo) {
    const termo = String(filtros.titulo).toLowerCase();
    dados = dados.filter((livro) => livro.titulo?.toLowerCase().includes(termo));
  }

  dados.sort((a, b) => paraData(b.criadoEm).getTime() - paraData(a.criadoEm).getTime());
  const page = Math.max(Number.parseInt(filtros.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(filtros.limit, 10) || 10, 1), 100);
  const start = (page - 1) * limit;

  return {
    total: dados.length,
    page,
    limit,
    totalPaginas: Math.ceil(dados.length / limit),
    dados: dados.slice(start, start + limit)
  };
};

export const registrarTransferenciaEmTransacao = (
  transaction,
  livroRef,
  livro,
  proprietarioAnteriorId,
  novoProprietarioId,
  proprietarioAnteriorNome,
  novoProprietarioNome,
  tipoNegociacao,
  solicitadaEm,
  dataConcluida
) => {
  const historicoRef = livroRef.collection('historicoPosse').doc();
  const negociacaoRef = livroRef.collection('historicoNegociacoes').doc();
  const qrToken = livro.qrToken || novoTokenQr();
  const qrUrl = livro.qrUrl || criarUrlRastreio(qrToken);
  const negociacao = {
    tipoNegociacao,
    proprietarioAnteriorId,
    proprietarioAnteriorNome,
    novoProprietarioId,
    novoProprietarioNome,
    solicitadaEm,
    dataConcluida
  };

  transaction.update(livroRef, {
    usuarioId: novoProprietarioId,
    usuarioNome: novoProprietarioNome,
    status: 'na_estante',
    qrToken,
    qrUrl
  });
  transaction.set(historicoRef, {
    usuarioId: novoProprietarioId,
    nome: novoProprietarioNome,
    proprietarioAnteriorId,
    proprietarioAnteriorNome,
    tipoNegociacao,
    dataInicio: dataConcluida
  });
  transaction.set(negociacaoRef, negociacao);
};

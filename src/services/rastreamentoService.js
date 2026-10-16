import { randomBytes } from 'node:crypto';
import { db } from '../config/firebase.js';
import { criarUrlRastreio } from './qrCodeService.js';
import { estante, formatarItemEstante } from './estanteService.js';

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
const nomeTipoNegociacao = (tipo) => ({
  venda: 'compra',
  troca: 'troca',
  doacao: 'doação'
}[tipo] || 'aquisição');

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
      titulo: 'Novo pedido de negociação',
      mensagem: `${usuarioNome || 'Uma pessoa'} solicitou ${nomeTipoNegociacao(tipoNegociacao)} do livro "${livro.titulo || 'sem título'}". Acesse seus anúncios para confirmar ou recusar.`,
      tipo: 'aquisicao',
      acao: 'revisar-aquisicao',
      livroId,
      livroTitulo: livro.titulo || '',
      solicitanteId: usuarioId,
      solicitanteNome: usuarioNome || '',
      tipoNegociacao,
      lida: false,
      criadoEm: solicitadaEm
    });
    return { livroId, ...transferenciaPendente };
  });
};

export const confirmarAquisicao = async (livroId, proprietarioId) => {
  const ref = livros.doc(livroId);
  const estanteRef = estante.doc(livroId);
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
    transaction.set(estanteRef, formatarItemEstante(livroId, {
      ...livro,
      usuarioId: transferencia.solicitanteId,
      usuarioNome: transferencia.solicitanteNome,
      status: 'na_estante',
      transferenciaPendente: null
    }));
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
      titulo: 'Negociação confirmada',
      mensagem: `O proprietário confirmou sua ${nomeTipoNegociacao(transferencia.tipoNegociacao)} do livro "${livro.titulo || 'sem título'}". O livro está na sua estante.`,
      tipo: 'aquisicao',
      livroId,
      livroTitulo: livro.titulo || '',
      tipoNegociacao: transferencia.tipoNegociacao,
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
      titulo: 'Negociação recusada',
      mensagem: `O proprietário recusou seu pedido de ${nomeTipoNegociacao(livro.transferenciaPendente.tipoNegociacao)} do livro "${livro.titulo || 'sem título'}".`,
      tipo: 'aquisicao',
      livroId,
      livroTitulo: livro.titulo || '',
      tipoNegociacao: livro.transferenciaPendente.tipoNegociacao,
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
  const estanteRef = estante.doc(livroId);
  const atualizadoEm = new Date();

  return db.runTransaction(async (transaction) => {
    const [snapshot, estanteSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(estanteRef)
    ]);
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
    const itemEstante = formatarItemEstante(livroId, {
      ...livro,
      estadoAcervo: estado,
      estadoAcervoAtualizadoEm: atualizadoEm,
      ...(estado === 'roubado' ? { transferenciaPendente: null } : {})
    });
    transaction.set(
      estanteRef,
      estanteSnapshot.exists ? { ...estanteSnapshot.data(), ...itemEstante } : itemEstante
    );
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
  const estanteRef = estante.doc(livroRef.id);
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
  transaction.set(estanteRef, formatarItemEstante(livroRef.id, {
    ...livro,
    usuarioId: novoProprietarioId,
    usuarioNome: novoProprietarioNome,
    status: 'na_estante',
    transferenciaPendente: null,
    qrToken,
    qrUrl
  }));
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

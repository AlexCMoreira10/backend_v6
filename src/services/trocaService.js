import { db } from '../config/firebase.js';
import { registrarTransferenciaEmTransacao } from './rastreamentoService.js';

const collection = db.collection('trocas');

export const criarTroca = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
  };
};

export const buscarTrocaPorId = async (id) => {
  const doc = await collection.doc(id).get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};

export const atualizarTroca = async (id, dados) => {
  await collection.doc(id).update(dados);
};

export const concluirTroca = async (id, usuarioId) => {
  const trocaRef = collection.doc(id);
  const dataConcluida = new Date();

  return db.runTransaction(async (transaction) => {
    const trocaSnapshot = await transaction.get(trocaRef);
    if (!trocaSnapshot.exists) {
      const erro = new Error('Troca não encontrada');
      erro.status = 404;
      throw erro;
    }

    const troca = trocaSnapshot.data();
    if (troca.destinatarioId !== usuarioId) {
      const erro = new Error('Sem permissão');
      erro.status = 403;
      throw erro;
    }
    if (troca.status !== 'pendente') {
      const erro = new Error('Troca já finalizada');
      erro.status = 409;
      throw erro;
    }

    const livroOfertadoRef = db.collection('livros').doc(troca.livroOfertadoId);
    const livroDesejadoRef = db.collection('livros').doc(troca.livroDesejadoId);
    const solicitanteRef = db.collection('users').doc(troca.solicitanteId);
    const destinatarioRef = db.collection('users').doc(troca.destinatarioId);
    const [ofertadoSnapshot, desejadoSnapshot, solicitanteSnapshot, destinatarioSnapshot] = await Promise.all([
      transaction.get(livroOfertadoRef),
      transaction.get(livroDesejadoRef),
      transaction.get(solicitanteRef),
      transaction.get(destinatarioRef)
    ]);

    if (!ofertadoSnapshot.exists || !desejadoSnapshot.exists) {
      const erro = new Error('Um dos livros da troca não foi encontrado');
      erro.status = 404;
      throw erro;
    }

    const livroOfertado = ofertadoSnapshot.data();
    const livroDesejado = desejadoSnapshot.data();
    if (
      livroOfertado.usuarioId !== troca.solicitanteId ||
      livroDesejado.usuarioId !== troca.destinatarioId ||
      livroOfertado.status !== 'disponivel' ||
      livroDesejado.status !== 'disponivel' ||
      livroOfertado.estadoAcervo === 'roubado' ||
      livroDesejado.estadoAcervo === 'roubado' ||
      livroOfertado.transferenciaPendente ||
      livroDesejado.transferenciaPendente
    ) {
      const erro = new Error('A propriedade ou disponibilidade dos livros mudou');
      erro.status = 409;
      throw erro;
    }

    registrarTransferenciaEmTransacao(
      transaction,
      livroOfertadoRef,
      livroOfertado,
      troca.solicitanteId,
      troca.destinatarioId,
      solicitanteSnapshot.data()?.nome || '',
      destinatarioSnapshot.data()?.nome || '',
      'troca',
      troca.criadoEm,
      dataConcluida
    );
    registrarTransferenciaEmTransacao(
      transaction,
      livroDesejadoRef,
      livroDesejado,
      troca.destinatarioId,
      troca.solicitanteId,
      destinatarioSnapshot.data()?.nome || '',
      solicitanteSnapshot.data()?.nome || '',
      'troca',
      troca.criadoEm,
      dataConcluida
    );
    transaction.update(trocaRef, { status: 'aceita', dataConcluida });

    return { id, status: 'aceita', solicitanteId: troca.solicitanteId, dataConcluida };
  });
};

export const listarTrocasPorUsuario = async (usuarioId) => {
  // 📥 Trocas recebidas
  const recebidasSnapshot = await collection
    .where('destinatarioId', '==', usuarioId)
    .orderBy('criadoEm', 'desc')
    .get();

  const recebidas = recebidasSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // 📤 Trocas enviadas
  const enviadasSnapshot = await collection
    .where('solicitanteId', '==', usuarioId)
    .orderBy('criadoEm', 'desc')
    .get();

  const enviadas = enviadasSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return {
    recebidas,
    enviadas
  };
};
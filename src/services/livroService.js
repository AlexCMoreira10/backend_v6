import { db } from '../config/firebase.js';
import { estante, formatarItemEstante } from './estanteService.js';

const collection = db.collection('livros');
const paraData = valor => (
  valor && typeof valor.toDate === 'function' ? valor.toDate() : new Date(valor || 0)
);

export const criarLivro = async (dados, { id, rascunhoId, usuarioId } = {}) => {
  const docRef = id ? collection.doc(id) : collection.doc();
  const historicoRef = docRef.collection('historicoPosse').doc();
  const estanteRef = estante.doc(docRef.id);
  const rascunhoRef = rascunhoId
    ? db.collection('rascunhosLivros').doc(rascunhoId)
    : null;

  const salvo = await db.runTransaction(async (transaction) => {
    const [livroSnapshot, rascunhoSnapshot] = await Promise.all([
      transaction.get(docRef),
      rascunhoRef ? transaction.get(rascunhoRef) : Promise.resolve(null)
    ]);

    if (livroSnapshot.exists) {
      const livroAtual = livroSnapshot.data();
      const fotosIguais = JSON.stringify(livroAtual.fotos || []) ===
        JSON.stringify(dados.fotos || []);
      if (rascunhoId &&
          livroAtual.usuarioId === usuarioId &&
          fotosIguais) {
        return livroAtual;
      }
      const erro = new Error('Já existe um livro com este identificador');
      erro.status = 409;
      throw erro;
    }

    if (rascunhoRef) {
      if (!rascunhoSnapshot?.exists) {
        const erro = new Error('Rascunho não encontrado ou já finalizado');
        erro.status = 404;
        throw erro;
      }
      const rascunho = rascunhoSnapshot.data();
      if (rascunho.usuarioId !== usuarioId ||
          rascunho.tipoRascunho !== 'criacao' ||
          rascunho.estado !== 'enviando' ||
          rascunho.livroId !== docRef.id) {
        const erro = new Error('Rascunho inválido para publicação');
        erro.status = 409;
        throw erro;
      }
      if (rascunho.expiraEm.toDate() <= new Date()) {
        const erro = new Error('O rascunho expirou; inicie a publicação novamente');
        erro.status = 410;
        throw erro;
      }
    }

    transaction.create(docRef, dados);
    transaction.set(estanteRef, formatarItemEstante(docRef.id, dados));
    transaction.set(historicoRef, {
      usuarioId: dados.usuarioId,
      nome: dados.usuarioNome,
      tipoNegociacao: 'cadastro',
      dataInicio: dados.criadoEm
    });
    if (rascunhoRef) transaction.delete(rascunhoRef);

    return dados;
  });

  return {
    id: docRef.id,
    ...salvo
  };
};

export const listarEstantePorUsuario = async (usuarioId, filtros) => {
  const [estanteSnapshot, livrosSnapshot] = await Promise.all([
    estante.where('usuarioId', '==', usuarioId).get(),
    collection.where('usuarioId', '==', usuarioId).get()
  ]);
  const itens = new Map(
    estanteSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }])
  );
  const itensLegados = livrosSnapshot.docs.filter(doc => !itens.has(doc.id));

  await Promise.all(itensLegados.map(async doc => {
    const livroRef = collection.doc(doc.id);
    const estanteRef = estante.doc(doc.id);
    const item = await db.runTransaction(async transaction => {
      const [livroAtual, itemAtual] = await Promise.all([
        transaction.get(livroRef),
        transaction.get(estanteRef)
      ]);
      if (!livroAtual.exists || livroAtual.data().usuarioId !== usuarioId) return null;
      if (itemAtual.exists) return null;

      const registro = formatarItemEstante(doc.id, livroAtual.data());
      transaction.set(estanteRef, registro);
      return registro;
    });
    if (item) itens.set(doc.id, item);
  }));

  let dados = [...itens.values()];
  if (filtros.estadoAcervo) {
    dados = dados.filter(livro => livro.estadoAcervo === filtros.estadoAcervo);
  }
  if (filtros.titulo) {
    const termo = String(filtros.titulo).toLowerCase();
    dados = dados.filter(livro => livro.titulo?.toLowerCase().includes(termo));
  }

  dados.sort((a, b) => {
    const dataA = paraData(a.criadoEm).getTime();
    const dataB = paraData(b.criadoEm).getTime();
    return dataB - dataA;
  });
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

export const listarLivros = async (filtros) => {
  let query = collection;

  // 🔎 Filtros diretos (Firestore)
  if (filtros.tipo) {
    query = query.where('tipo', '==', filtros.tipo);
  }

  if (filtros.status) {
    query = query.where('status', '==', filtros.status);
  }

  if (filtros.autor) {
    query = query.where('autor', '==', filtros.autor);
  }

  // 💰 Range de preço
  if (filtros.precoMin) {
    query = query.where('preco', '>=', Number(filtros.precoMin));
  }

  if (filtros.precoMax) {
    query = query.where('preco', '<=', Number(filtros.precoMax));
  }

  // 📊 Ordenação
  query = query.orderBy('criadoEm', 'desc');

  const snapshot = await query.get();

  let livros = snapshot.docs.map(doc => {
    const dados = doc.data();
    delete dados.qrToken;
    delete dados.transferenciaPendente;
    return { id: doc.id, ...dados };
  }).filter(livro =>
    livro.status !== 'na_estante' && !['roubado', 'perdido'].includes(livro.estadoAcervo)
  );

  // 🔎 Busca parcial por título (Node)
  if (filtros.titulo) {
    const termo = filtros.titulo.toLowerCase();

    livros = livros.filter(livro =>
      livro.titulo.toLowerCase().includes(termo)
    );
  }

  // 📄 Paginação
  const page = parseInt(filtros.page) || 1;
  const limit = parseInt(filtros.limit) || 10;

  const start = (page - 1) * limit;
  const end = start + limit;

  const total = livros.length;

  return {
    total,
    page,
    limit,
    totalPaginas: Math.ceil(total / limit),
    dados: livros.slice(start, end)
  };
};

export const buscarLivroPorId = async (id) => {
  const doc = await collection.doc(id).get();

  if (!doc.exists) return null;

  return {
    id: doc.id,
    ...doc.data()
  };
};

export const atualizarLivro = async (
  id,
  dadosAtualizados,
  usuarioId,
  { imageDraftId } = {}
) => {
  const livroRef = collection.doc(id);
  const estanteRef = estante.doc(id);
  const imageDraftRef = imageDraftId
    ? db.collection('rascunhosLivros').doc(imageDraftId)
    : null;

  return db.runTransaction(async (transaction) => {
    const [snapshot, imageDraftSnapshot] = await Promise.all([
      transaction.get(livroRef),
      imageDraftRef ? transaction.get(imageDraftRef) : Promise.resolve(null)
    ]);
    if (!snapshot.exists) {
      const erro = new Error('Livro não encontrado');
      erro.status = 404;
      throw erro;
    }

    const livro = snapshot.data();
    if (livro.usuarioId !== usuarioId) {
      const erro = new Error('Você não tem permissão para editar este livro');
      erro.status = 403;
      throw erro;
    }
    if (livro.transferenciaPendente) {
      const erro = new Error('Conclua ou recuse a aquisição pendente antes de editar este livro');
      erro.status = 409;
      throw erro;
    }

    if (imageDraftRef) {
      if (!imageDraftSnapshot?.exists) {
        const erro = new Error('Rascunho de imagens não encontrado ou já utilizado');
        erro.status = 409;
        throw erro;
      }
      const rascunho = imageDraftSnapshot.data();
      if (rascunho.tipoRascunho !== 'edicao' ||
          rascunho.estado !== 'enviando' ||
          rascunho.usuarioId !== usuarioId ||
          rascunho.livroId !== id ||
          rascunho.expiraEm.toDate() <= new Date()) {
        const erro = new Error('Rascunho de imagens inválido ou expirado');
        erro.status = 409;
        throw erro;
      }
    }

    const dados = { ...livro, ...dadosAtualizados };
    transaction.update(livroRef, dadosAtualizados);
    transaction.set(estanteRef, formatarItemEstante(id, dados));
    if (imageDraftRef) transaction.delete(imageDraftRef);

    return { id, ...dados };
  });
};

export const retirarAnuncio = async (id, usuarioId) => {
  const livroRef = collection.doc(id);
  const estanteRef = estante.doc(id);

  return db.runTransaction(async (transaction) => {
    const livroSnapshot = await transaction.get(livroRef);

    if (!livroSnapshot.exists) {
      const erro = new Error('Livro não encontrado');
      erro.status = 404;
      throw erro;
    }

    const livro = livroSnapshot.data();
    if (livro.usuarioId !== usuarioId) {
      const erro = new Error('Você não tem permissão para remover este anúncio');
      erro.status = 403;
      throw erro;
    }
    if (livro.transferenciaPendente) {
      const erro = new Error('Recuse ou conclua a aquisição pendente antes de remover o anúncio');
      erro.status = 409;
      throw erro;
    }
    if (livro.status === 'na_estante') {
      return { id, status: 'na_estante', anuncioRemovido: true };
    }
    if (!['disponivel', 'reservado'].includes(livro.status)) {
      const erro = new Error('Somente anúncios ativos podem ser removidos');
      erro.status = 409;
      throw erro;
    }

    const livroAtualizado = { ...livro, status: 'na_estante' };
    transaction.update(livroRef, { status: 'na_estante' });
    transaction.set(
      estanteRef,
      formatarItemEstante(id, livroAtualizado),
      { merge: true }
    );

    return { id, status: 'na_estante', anuncioRemovido: true };
  });
};

export const listarLivrosPorUsuario = async (usuarioId, filtros) => {
  let query = collection.where('usuarioId', '==', usuarioId);

  // filtros opcionais
  if (filtros.status) {
    query = query.where('status', '==', filtros.status);
  }

  if (filtros.tipo) {
    query = query.where('tipo', '==', filtros.tipo);
  }

  query = query.orderBy('criadoEm', 'desc');

  const snapshot = await query.get();

  let livros = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })).filter(livro => livro.status !== 'na_estante');

  // filtro manual por título
  if (filtros.titulo) {
    const termo = filtros.titulo.toLowerCase();

    livros = livros.filter(l =>
      l.titulo.toLowerCase().includes(termo)
    );
  }

  // 📄 paginação
  const page = parseInt(filtros.page) || 1;
  const limit = parseInt(filtros.limit) || 10;

  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    total: livros.length,
    page,
    limit,
    totalPaginas: Math.ceil(livros.length / limit),
    dados: livros.slice(start, end)
  };
};

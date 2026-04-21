import { db } from '../config/firebase.js';

const collection = db.collection('livros');

export const criarLivro = async (dados) => {
  const docRef = await collection.add(dados);

  return {
    id: docRef.id,
    ...dados
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

  let livros = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

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

export const atualizarLivro = async (id, dadosAtualizados) => {
  await collection.doc(id).update(dadosAtualizados);

  return { id, ...dadosAtualizados };
};

export const deletarLivro = async (id) => {
  await collection.doc(id).delete();
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
  }));

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

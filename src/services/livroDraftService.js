import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import admin, { db } from '../config/firebase.js';
import {
  ehHostFirebaseStorage,
  extrairPathObjetoStorage,
  validarUrlsExternasLivro
} from '../utils/bookPhotoReference.js';
import { extensaoImagemValida } from '../utils/bookImageValidation.js';

const rascunhos = db.collection('rascunhosLivros');
const bucketNome = process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`;
const bucket = getStorage().bucket(bucketNome);
const DURACAO_RASCUNHO_MS = 24 * 60 * 60 * 1000;
const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const TIPOS_IMAGEM_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const falhar = (status, mensagem) => {
  const erro = new Error(mensagem);
  erro.status = status;
  throw erro;
};

const criarExpiracao = () => admin.firestore.Timestamp.fromDate(
  new Date(Date.now() + DURACAO_RASCUNHO_MS)
);

const validarUrlsExternas = (fotos) => {
  const erro = validarUrlsExternasLivro(fotos, bucketNome);
  if (erro) falhar(400, erro);
  return fotos;
};

export const criarRascunhoLivro = async ({
  dados,
  fotosExternas,
  usuarioId,
  usuarioNome,
  geocodeUsuario
}) => {
  validarUrlsExternas(fotosExternas);
  const referencia = rascunhos.doc();
  const expira = criarExpiracao();
  const dadosLivro = {
    ...dados,
    fotos: [],
    ...(geocodeUsuario ? { geocode: geocodeUsuario } : {})
  };

  await referencia.create({
    tipoRascunho: 'criacao',
    estado: 'enviando',
    usuarioId,
    usuarioNome,
    livroId: referencia.id,
    dados: dadosLivro,
    fotosExternas,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    expiraEm: expira
  });

  return {
    id: referencia.id,
    livroId: referencia.id,
    estado: 'rascunho',
    expiraEm: expira.toDate().toISOString()
  };
};

export const buscarRascunhoLivro = async (id) => {
  const snapshot = await rascunhos.doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const criarRascunhoImagensLivro = async ({ livroId, usuarioId }) => {
  const livroRef = db.collection('livros').doc(livroId);
  const referencia = rascunhos.doc(randomUUID());
  const expira = criarExpiracao();

  await db.runTransaction(async (transaction) => {
    const livroSnapshot = await transaction.get(livroRef);
    if (!livroSnapshot.exists) falhar(404, 'Livro não encontrado');

    const livro = livroSnapshot.data();
    if (livro.usuarioId !== usuarioId) {
      falhar(403, 'Você não tem permissão para editar este livro');
    }
    if (livro.transferenciaPendente) {
      falhar(409, 'Conclua ou recuse a aquisição pendente antes de editar este livro');
    }

    transaction.create(referencia, {
      tipoRascunho: 'edicao',
      estado: 'enviando',
      usuarioId,
      livroId,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      expiraEm: expira
    });
  });

  return {
    id: referencia.id,
    livroId,
    estado: 'rascunho',
    expiraEm: expira.toDate().toISOString()
  };
};

export const validarFotosLivro = async ({
  fotos,
  usuarioId,
  livroId,
  uploadId,
  fotosExistentes = []
}) => {
  if (!Array.isArray(fotos) || fotos.length > 5) {
    falhar(400, 'Envie uma lista de até 5 imagens');
  }
  if (fotos.some((foto) => typeof foto !== 'string') ||
      new Set(fotos).size !== fotos.length) {
    falhar(400, 'As imagens devem ser URLs válidas e sem duplicatas');
  }

  const uploadsReferenciados = new Set();
  for (const foto of fotos) {
    if (fotosExistentes.includes(foto)) continue;

    let url;
    try {
      url = new URL(foto);
    } catch {
      falhar(400, 'Cada imagem deve ser informada por uma URL HTTPS válida');
    }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      falhar(400, 'Cada imagem deve ser informada por uma URL HTTPS válida, sem usuário ou senha');
    }

    if (!ehHostFirebaseStorage(url.hostname) && url.hostname !== bucketNome) continue;

    const path = extrairPathObjetoStorage(foto, bucketNome);
    const prefixoEsperado = `livros/${usuarioId}/${livroId}/`;
    const nomeArquivo = path?.slice(prefixoEsperado.length);
    if (!path?.startsWith(prefixoEsperado) ||
        !/^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(nomeArquivo || '')) {
      falhar(400, 'A imagem do Storage não pertence a este usuário e anúncio');
    }

    try {
      const [metadata] = await bucket.file(path).getMetadata();
      const tamanho = Number(metadata.size);
      if (!TIPOS_IMAGEM_PERMITIDOS.has(metadata.contentType) ||
          !Number.isFinite(tamanho) ||
          tamanho <= 0 ||
          tamanho > TAMANHO_MAXIMO_IMAGEM) {
        falhar(400, 'A imagem deve ser JPEG, PNG ou WebP e ter no máximo 5 MB');
      }
      if (!uploadId || metadata.metadata?.uploadId !== uploadId) {
        falhar(400, 'A imagem não pertence a esta operação de upload');
      }
      const [conteudo] = await bucket.file(path).download();
      if (!extensaoImagemValida(metadata.contentType, conteudo)) {
        falhar(400, 'O conteúdo da imagem não corresponde ao formato informado');
      }
      uploadsReferenciados.add(path);
    } catch (erro) {
      if (erro.status) throw erro;
      if (erro.code === 404) falhar(400, 'Uma imagem enviada não foi encontrada no Storage');
      throw erro;
    }
  }

  if (uploadId) {
    const uploadsDaOperacao = await listarUploadsDaOperacao({
      id: uploadId,
      usuarioId,
      livroId
    });
    if (uploadsDaOperacao.some((arquivo) => !uploadsReferenciados.has(arquivo.name)) ||
        uploadsReferenciados.size !== uploadsDaOperacao.length) {
      falhar(400, 'Inclua todas as imagens enviadas nesta operação ou descarte o rascunho');
    }
  }

  return fotos;
};

const reivindicarLimpeza = async (id, usuarioId = null, apenasExpirados = false) => {
  const referencia = rascunhos.doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(referencia);
    if (!snapshot.exists) return null;

    const rascunho = snapshot.data();
    if (usuarioId && rascunho.usuarioId !== usuarioId) {
      falhar(403, 'Você não tem permissão para descartar este rascunho');
    }
    if (apenasExpirados && rascunho.expiraEm.toDate() > new Date()) return null;
    if (rascunho.estado !== 'limpando') {
      transaction.update(referencia, {
        estado: 'limpando',
        expiraEm: admin.firestore.Timestamp.now()
      });
    }
    return { id, ...rascunho, estado: 'limpando' };
  });
};

const listarUploadsDaOperacao = async (rascunho) => {
  const prefixo = `livros/${rascunho.usuarioId}/${rascunho.livroId}/`;
  let consulta = { prefix: prefixo, autoPaginate: false, maxResults: 500 };
  const uploads = [];

  do {
    const [arquivos, proximaConsulta] = await bucket.getFiles(consulta);
    await Promise.all(arquivos.map(async (arquivo) => {
      const [metadata] = await arquivo.getMetadata();
      if (metadata.metadata?.uploadId === rascunho.id) {
        uploads.push(arquivo);
      }
    }));
    consulta = proximaConsulta;
  } while (consulta);

  return uploads;
};

const apagarUploadsDaOperacao = async (rascunho) => {
  const uploads = await listarUploadsDaOperacao(rascunho);
  await Promise.all(uploads.map((arquivo) => arquivo.delete({ ignoreNotFound: true })));
};

export const descartarRascunhoLivro = async (id, usuarioId) => {
  const rascunho = await reivindicarLimpeza(id, usuarioId);
  if (!rascunho) return false;

  if (rascunho.tipoRascunho === 'criacao') {
    const livroSnapshot = await db.collection('livros').doc(rascunho.livroId).get();
    if (livroSnapshot.exists && livroSnapshot.data().usuarioId === usuarioId) {
      falhar(409, 'O anúncio já foi publicado e não pode ser descartado');
    }
  } else {
    const livroSnapshot = await db.collection('livros').doc(rascunho.livroId).get();
    if (!livroSnapshot.exists || livroSnapshot.data().usuarioId !== usuarioId) {
      falhar(403, 'Você não tem mais permissão para descartar as imagens deste anúncio');
    }
  }

  try {
    await apagarUploadsDaOperacao(rascunho);
    await rascunhos.doc(id).delete();
    return true;
  } catch (erro) {
    console.error(`Falha ao limpar uploads do rascunho ${id}:`, erro);
    throw new Error('Não foi possível limpar os uploads agora; a limpeza será repetida automaticamente.');
  }
};

export const limparRascunhosExpirados = async () => {
  const agora = admin.firestore.Timestamp.now();
  const snapshot = await rascunhos.where('expiraEm', '<=', agora).limit(100).get();
  let removidos = 0;
  let falhas = 0;

  for (const documento of snapshot.docs) {
    try {
      const rascunho = await reivindicarLimpeza(documento.id, null, true);
      if (!rascunho) continue;

      await apagarUploadsDaOperacao(rascunho);
      await rascunhos.doc(documento.id).delete();
      removidos += 1;
    } catch (erro) {
      falhas += 1;
      console.error(`Falha ao limpar o rascunho expirado ${documento.id}:`, erro);
    }
  }

  return { encontrados: snapshot.size, removidos, falhas };
};

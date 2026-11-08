import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ehHostFirebaseStorage,
  extrairPathObjetoStorage,
  validarUrlsExternasLivro
} from '../src/utils/bookPhotoReference.js';

const bucketNome = 'babel-5dcbd.firebasestorage.app';

test('accepts public HTTPS URLs but rejects Storage URLs as external links', () => {
  assert.equal(
    validarUrlsExternasLivro(['https://images.example.com/capa.jpg'], bucketNome),
    null
  );
  assert.match(
    validarUrlsExternasLivro(['http://images.example.com/capa.jpg'], bucketNome),
    /HTTPS/
  );
  assert.match(
    validarUrlsExternasLivro(['https://firebasestorage.googleapis.com/v0/b/other/o/book'], bucketNome),
    /Storage/
  );
  assert.match(
    validarUrlsExternasLivro(['https://user:pass@images.example.com/capa.jpg'], bucketNome),
    /usuário ou senha/
  );
});

test('extracts only object paths from the configured Firebase bucket', () => {
  const path = 'livros/uid-123/book-456/image_1.webp';
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketNome}/o/${encodeURIComponent(path)}?alt=media&token=token-value`;

  assert.equal(extrairPathObjetoStorage(url, bucketNome), path);
  assert.equal(
    extrairPathObjetoStorage(url.replace(bucketNome, 'other-bucket.firebasestorage.app'), bucketNome),
    null
  );
  assert.equal(
    extrairPathObjetoStorage('https://images.example.com/' + path, bucketNome),
    null
  );
});

test('recognizes Firebase Storage hosts for ownership validation', () => {
  assert.equal(ehHostFirebaseStorage('firebasestorage.googleapis.com'), true);
  assert.equal(ehHostFirebaseStorage('storage.googleapis.com'), true);
  assert.equal(ehHostFirebaseStorage(bucketNome), true);
  assert.equal(ehHostFirebaseStorage('images.example.com'), false);
});

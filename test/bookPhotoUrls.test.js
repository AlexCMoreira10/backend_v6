import test from 'node:test';
import assert from 'node:assert/strict';
import { validarUrlsFotos } from '../src/utils/bookPhotoUrls.js';

test('accepts empty photos and public HTTPS image URLs', () => {
  assert.equal(validarUrlsFotos(undefined), null);
  assert.equal(validarUrlsFotos([]), null);
  assert.equal(
    validarUrlsFotos(['https://images.example.com/book-cover.jpg?size=large']),
    null
  );
});

test('rejects invalid photo collections and unsafe URL schemes', () => {
  assert.match(validarUrlsFotos('https://images.example.com/book.jpg'), /lista/);
  assert.match(validarUrlsFotos(Array(6).fill('https://images.example.com/book.jpg')), /5/);
  assert.match(validarUrlsFotos(['javascript:alert(1)']), /HTTPS/);
  assert.match(validarUrlsFotos(['http://images.example.com/book.jpg']), /HTTPS/);
  assert.match(validarUrlsFotos(['https://user:pass@example.com/book.jpg']), /usuário ou senha/);
});

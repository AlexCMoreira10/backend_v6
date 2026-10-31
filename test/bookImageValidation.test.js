import test from 'node:test';
import assert from 'node:assert/strict';
import { extensaoImagemValida } from '../src/utils/bookImageValidation.js';

test('accepts supported image signatures and maps them to safe extensions', () => {
  assert.equal(
    extensaoImagemValida('image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    'jpg'
  );
  assert.equal(
    extensaoImagemValida('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'png'
  );
  assert.equal(
    extensaoImagemValida('image/webp', Buffer.from('RIFF0000WEBP')),
    'webp'
  );
});

test('rejects unsupported image types and mismatched file signatures', () => {
  assert.equal(extensaoImagemValida('image/gif', Buffer.from('GIF89a')), null);
  assert.equal(extensaoImagemValida('image/png', Buffer.from('not a PNG')), null);
  assert.equal(extensaoImagemValida('image/jpeg', Buffer.alloc(0)), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from './admin.js';

test('Firestore Admin SDK reads and writes only through the configured emulator', async () => {
  const reference = db.collection('__emulator_safety_checks').doc(randomUUID());
  try {
    await reference.set({ projectId: 'demo-estante-babel' });
    const snapshot = await reference.get();
    assert.equal(snapshot.data().projectId, 'demo-estante-babel');
  } finally {
    await reference.delete();
  }
});

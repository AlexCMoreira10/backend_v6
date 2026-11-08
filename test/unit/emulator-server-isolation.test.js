import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serverSource = new URL('../firestore-emulator/server.js', import.meta.url);
const adminSource = new URL('../firestore-emulator/admin.js', import.meta.url);

test('test server does not import production app, Firebase config, dotenv, or real geocoder', async () => {
  const [server, admin] = await Promise.all([
    readFile(serverSource, 'utf8'),
    readFile(adminSource, 'utf8')
  ]);
  const forbiddenImports = [
    '../app.js',
    '../../app.js',
    'src/config/firebase.js',
    'dotenv',
    'geocodingService.js'
  ];

  for (const forbidden of forbiddenImports) {
    assert.doesNotMatch(server, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(admin, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(server, /criarGeocodificadorSimulado/);
  assert.match(admin, /validarAmbienteEmulador\(\)/);
});

test('test health checks both emulators and only binds the server to loopback', async () => {
  const server = await readFile(serverSource, 'utf8');
  assert.match(server, /\/api\/__test\/health/);
  assert.match(server, /verificarAuthEmulator/);
  assert.match(server, /verificarFirestoreEmulator/);
  assert.match(server, /listen\(port, host/);
  assert.match(server, /host = '127\.0\.0\.1'/);
  assert.match(server, /host !== '127\.0\.0\.1'/);
  assert.match(server, /LOCAL_FRONTEND_HOSTS/);
  assert.match(server, /Access-Control-Allow-Headers/);
});

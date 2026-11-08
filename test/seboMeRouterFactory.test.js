import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarRouterMeuSebo } from '../src/routes/seboMeRouter.js';

const noop = () => {};

test('mounts only the profile routes with their original middleware order', () => {
  const dependencies = {
    verificarTokenSebo: () => {},
    exigirGestorSebo: () => {},
    buscarMeuSebo: () => {},
    atualizarMeuSebo: () => {},
    sincronizarLocalizacaoMeuSebo: () => {}
  };
  const router = criarRouterMeuSebo(dependencies);
  const routes = router.stack.map(layer => ({
    path: layer.route.path,
    method: Object.keys(layer.route.methods).find(method => layer.route.methods[method]),
    handlers: layer.route.stack.map(handler => handler.handle)
  }));

  assert.deepEqual(routes, [
    {
      path: '/sebos/me',
      method: 'get',
      handlers: [
        dependencies.verificarTokenSebo,
        dependencies.buscarMeuSebo
      ]
    },
    {
      path: '/sebos/me',
      method: 'patch',
      handlers: [
        dependencies.verificarTokenSebo,
        dependencies.exigirGestorSebo,
        dependencies.atualizarMeuSebo
      ]
    },
    {
      path: '/sebos/me/localizacao/sincronizar',
      method: 'post',
      handlers: [
        dependencies.verificarTokenSebo,
        dependencies.exigirGestorSebo,
        dependencies.sincronizarLocalizacaoMeuSebo
      ]
    }
  ]);
});

test('factory module builds an Express router without production Firebase dependencies', async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'sebo-router-factory-'));
  const factoryUrl = new URL('../src/routes/seboMeRouter.js', import.meta.url).href;
  try {
    const { stdout, status, error } = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `
        import { criarRouterMeuSebo } from '${factoryUrl}';
        const noop = () => {};
        const router = criarRouterMeuSebo({
          verificarTokenSebo: noop,
          exigirGestorSebo: noop,
          buscarMeuSebo: noop,
          atualizarMeuSebo: noop,
          sincronizarLocalizacaoMeuSebo: noop
        });
        if (router.stack.length !== 3) process.exit(1);
        console.log('factory isolated');
      `
    ], {
      cwd: workingDirectory,
      env: { PATH: process.env.PATH, HOME: workingDirectory },
      encoding: 'utf8'
    });

    assert.equal(error, undefined);
    assert.equal(status, 0);
    assert.match(stdout, /factory isolated/);
    assert.doesNotMatch(stdout, /Firebase Admin|dotenv/);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

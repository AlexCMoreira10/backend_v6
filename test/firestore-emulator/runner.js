import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./guard.js');

const directory = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(directory)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => resolve(directory, name));

if (testFiles.length === 0) {
  throw new Error('Nenhum teste dedicado do Firestore Emulator foi encontrado.');
}

const isolatedWorkingDirectory = mkdtempSync(
  resolve(tmpdir(), 'estante-babel-firestore-emulator-')
);

try {
  const resultado = spawnSync(
    process.execPath,
    [
      '--import',
      resolve(directory, 'guard.js'),
      '--test',
      ...testFiles
    ],
    {
      cwd: isolatedWorkingDirectory,
      env: process.env,
      stdio: 'inherit'
    }
  );

  if (resultado.error) throw resultado.error;
  process.exitCode = resultado.status ?? 1;
} finally {
  rmdirSync(isolatedWorkingDirectory);
}

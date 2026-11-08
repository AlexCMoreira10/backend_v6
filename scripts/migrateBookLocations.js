import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import admin, { db } from '../src/config/firebase.js';
import { planejarMigracaoLocalizacao } from '../src/utils/profileLocation.js';

const argumentos = process.argv.slice(2);
const restaurarIndex = argumentos.indexOf('--restore');
const aplicar = argumentos.includes('--apply');
const dryRun = argumentos.includes('--dry-run') || !aplicar;

if (argumentos.includes('--dry-run') && aplicar) {
  throw new Error('Use --dry-run ou --apply, não os dois juntos.');
}
if (restaurarIndex !== -1 && aplicar) {
  throw new Error('Use --restore ou --apply, não os dois juntos.');
}
if (restaurarIndex !== -1 && !argumentos[restaurarIndex + 1]) {
  throw new Error('Informe o arquivo de backup após --restore.');
}

const lerDadosAtuais = async () => {
  const [livrosSnapshot, perfisSnapshot] = await Promise.all([
    db.collection('livros').get(),
    db.collection('users').get()
  ]);
  const livros = livrosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const perfisPorId = new Map(
    perfisSnapshot.docs.map(doc => [doc.id, doc.data()])
  );
  return { livros, perfisPorId };
};

const aplicarLotes = async (itens, atualizar) => {
  for (let inicio = 0; inicio < itens.length; inicio += 400) {
    const lote = db.batch();
    itens.slice(inicio, inicio + 400).forEach(item => atualizar(lote, item));
    await lote.commit();
  }
};

const restaurar = async arquivo => {
  const backup = JSON.parse(await readFile(resolve(arquivo), 'utf8'));
  if (backup.formato !== 'babel-book-location-backup-v1' || !Array.isArray(backup.dados)) {
    throw new Error('O arquivo não é um backup de localização válido.');
  }

  await aplicarLotes(backup.dados, (lote, item) => {
    const atualizacao = {};
    for (const campo of ['geocode', 'localizacao', 'localizacaoVersaoPerfil']) {
      atualizacao[campo] = item.campos[campo].presente
        ? item.campos[campo].valor
        : admin.firestore.FieldValue.delete();
    }
    lote.update(db.collection('livros').doc(item.id), atualizacao);
  });
  console.info(`Restaurados ${backup.dados.length} anúncios do backup ${resolve(arquivo)}.`);
};

const executar = async () => {
  if (restaurarIndex !== -1) {
    await restaurar(argumentos[restaurarIndex + 1]);
    return;
  }

  const { livros, perfisPorId } = await lerDadosAtuais();
  const plano = planejarMigracaoLocalizacao(livros, perfisPorId);
  const livrosPorId = new Map(livros.map(livro => [livro.id, livro]));

  console.info(JSON.stringify({
    modo: dryRun ? 'dry-run (nenhuma alteração será feita)' : 'aplicar',
    anunciosAfetados: plano.totalAfetados,
    sebosPreservados: plano.sebosIgnorados,
    anunciosSemCoordenadasPreservados: plano.semCoordenadasIgnorados,
    anunciosSemPerfilIgnorados: plano.semPerfilIgnorados
  }, null, 2));

  if (dryRun || !plano.alteracoes.length) return;

  const backupPath = resolve(
    process.env.BOOK_LOCATION_BACKUP_PATH ||
    `migration-backups/book-location-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`
  );
  const backup = {
    formato: 'babel-book-location-backup-v1',
    criadoEm: new Date().toISOString(),
    dados: plano.alteracoes.map(item => {
      const livro = livrosPorId.get(item.id);
      return {
        id: item.id,
        campos: Object.fromEntries(
          ['geocode', 'localizacao', 'localizacaoVersaoPerfil'].map(campo => [
            campo,
            {
              presente: Object.hasOwn(livro, campo),
              ...(Object.hasOwn(livro, campo) ? { valor: livro[campo] } : {})
            }
          ])
        )
      };
    })
  };
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx' });
  console.info(`Backup salvo antes de alterar dados: ${backupPath}`);

  await aplicarLotes(plano.alteracoes, (lote, item) => {
    const atualizacao = {
      localizacao: item.localizacao,
      localizacaoVersaoPerfil: item.localizacaoVersaoPerfil,
      geocode: item.geocode || admin.firestore.FieldValue.delete()
    };
    lote.update(db.collection('livros').doc(item.id), atualizacao);
  });
  console.info(`Migração concluída: ${plano.totalAfetados} anúncios atualizados.`);
};

executar().catch(error => {
  console.error('Migração de localização interrompida:', error);
  process.exitCode = 1;
});

const geocodeValido = geocode =>
  geocode?.type === 'Point' &&
  Array.isArray(geocode.coordinates) &&
  geocode.coordinates.length === 2 &&
  Number.isFinite(geocode.coordinates[0]) &&
  geocode.coordinates[0] >= -180 &&
  geocode.coordinates[0] <= 180 &&
  Number.isFinite(geocode.coordinates[1]) &&
  geocode.coordinates[1] >= -90 &&
  geocode.coordinates[1] <= 90;

export const criarSincronizadorLocalizacaoSebo = ({
  db,
  deleteField,
  documentIdFieldPath,
  geocodificarEndereco,
  now = () => new Date(),
  logger = console,
  batchSize = 200,
  maxBatchesPerRequest = 2
}) => {
  const sebos = db.collection('sebos');
  const lotesPorRequisicao = Number.isInteger(maxBatchesPerRequest)
    ? Math.max(1, Math.min(maxBatchesPerRequest, 2))
    : 2;

  const marcarErro = async (seboRef, versao, mensagem, limparGeocode) =>
    db.runTransaction(async transaction => {
      const snapshot = await transaction.get(seboRef);
      if (!snapshot.exists || (Number(snapshot.data().localizacaoVersao) || 0) !== versao) {
        return false;
      }
      transaction.update(seboRef, {
        ...(limparGeocode ? { geocode: deleteField() } : {}),
        localizacaoSyncStatus: 'erro',
        localizacaoSyncErro: mensagem,
        localizacaoSyncAtualizadoEm: now()
      });
      return true;
    });

  const retornarEstadoAtual = async seboRef => {
    const atual = await seboRef.get();
    return {
      status: atual.data()?.localizacaoSyncStatus || 'pendente',
      supersedido: true
    };
  };

  const definirGeocodePendente = async (seboRef, versao, geocode) =>
    db.runTransaction(async transaction => {
      const snapshot = await transaction.get(seboRef);
      if (!snapshot.exists || (Number(snapshot.data().localizacaoVersao) || 0) !== versao) {
        return false;
      }
      transaction.update(seboRef, {
        geocode,
        localizacaoSyncStatus: 'pendente',
        localizacaoSyncErro: deleteField(),
        localizacaoSyncCursor: deleteField(),
        localizacaoSyncAtualizadoEm: now()
      });
      return true;
    });

  const processarLotes = async (uid, versao) => {
    const seboRef = sebos.doc(uid);
    const livros = db.collection('livros');
    let totalAtualizados = 0;
    let lotesProcessados = 0;

    while (lotesProcessados < lotesPorRequisicao) {
      const lote = await db.runTransaction(async transaction => {
        const seboSnapshot = await transaction.get(seboRef);
        if (!seboSnapshot.exists) return { concluido: true, supersedido: true };

        const sebo = seboSnapshot.data();
        if ((Number(sebo.localizacaoVersao) || 0) !== versao ||
            sebo.localizacaoSyncStatus !== 'pendente') {
          return { concluido: true, supersedido: true };
        }

        let consulta = livros
          .where('seboId', '==', uid)
          .orderBy(documentIdFieldPath)
          .limit(batchSize);
        if (sebo.localizacaoSyncCursor) {
          consulta = consulta.startAfter(livros.doc(sebo.localizacaoSyncCursor));
        }
        const snapshot = await transaction.get(consulta);
        if (snapshot.empty) {
          transaction.update(seboRef, {
            localizacaoSyncStatus: 'sincronizado',
            localizacaoSyncErro: deleteField(),
            localizacaoSyncCursor: deleteField(),
            localizacaoSyncAtualizadoEm: now()
          });
          return { concluido: true };
        }

        const geocode = geocodeValido(sebo.geocode) ? sebo.geocode : null;
        snapshot.docs.forEach(livro => {
          transaction.update(livro.ref, {
            ...(geocode ? { geocode } : { geocode: deleteField() }),
            localizacaoVersaoPerfil: versao
          });
        });
        transaction.update(seboRef, {
          localizacaoSyncCursor: snapshot.docs.at(-1).id,
          localizacaoSyncAtualizadoEm: now()
        });
        return { concluido: false, atualizados: snapshot.size };
      });

      if (lote.supersedido) return lote;
      if (lote.concluido) {
        return { ...lote, atualizados: totalAtualizados };
      }
      totalAtualizados += lote.atualizados;
      lotesProcessados += 1;
    }

    return { concluido: false, pendente: true, atualizados: totalAtualizados };
  };

  return async uid => {
    const seboRef = sebos.doc(uid);
    const snapshot = await seboRef.get();
    if (!snapshot.exists) return null;

    const sebo = snapshot.data();
    const versao = Number(sebo.localizacaoVersao) || 0;
    const temGeocode = geocodeValido(sebo.geocode);
    if (sebo.localizacaoSyncStatus === 'sincronizado' && temGeocode) {
      return { status: 'sincronizado', versao, anunciosAtualizados: 0 };
    }

    if (temGeocode) {
      await db.runTransaction(async transaction => {
        const atual = await transaction.get(seboRef);
        if (!atual.exists || (Number(atual.data().localizacaoVersao) || 0) !== versao) return;
        transaction.update(seboRef, {
          localizacaoSyncStatus: 'pendente',
          localizacaoSyncErro: deleteField(),
          localizacaoSyncAtualizadoEm: now()
        });
      });
    } else {
      await db.runTransaction(async transaction => {
        const atual = await transaction.get(seboRef);
        if (!atual.exists || (Number(atual.data().localizacaoVersao) || 0) !== versao) return;
        transaction.update(seboRef, {
          localizacaoSyncStatus: 'pendente',
          localizacaoSyncCursor: deleteField(),
          localizacaoSyncErro: deleteField(),
          localizacaoSyncAtualizadoEm: now()
        });
      });

      try {
        const resultado = await geocodificarEndereco(sebo.endereco);
        if (!geocodeValido(resultado.geocode)) {
          const mensagem = resultado.aviso || 'Não foi possível geocodificar o endereço comercial.';
          const marcado = await marcarErro(seboRef, versao, mensagem, true);
          if (!marcado) return retornarEstadoAtual(seboRef);
          return { status: 'erro', versao, anunciosAtualizados: 0, erro: mensagem };
        }
        const atualizado = await definirGeocodePendente(seboRef, versao, resultado.geocode);
        if (!atualizado) return retornarEstadoAtual(seboRef);
      } catch (error) {
        const mensagem = 'Não foi possível geocodificar o novo endereço. Tente sincronizar novamente.';
        logger.error('Falha ao geocodificar o endereço comercial do sebo:', error);
        const marcado = await marcarErro(seboRef, versao, mensagem, true);
        if (!marcado) return retornarEstadoAtual(seboRef);
        return { status: 'erro', versao, anunciosAtualizados: 0, erro: mensagem };
      }
    }

    try {
      const resultado = await processarLotes(uid, versao);
      if (resultado.supersedido) {
        return retornarEstadoAtual(seboRef);
      }
      if (resultado.pendente) {
        return {
          status: 'pendente',
          versao,
          anunciosAtualizados: resultado.atualizados,
          continuar: true
        };
      }
      return {
        status: 'sincronizado',
        versao,
        anunciosAtualizados: resultado.atualizados || 0
      };
    } catch (error) {
      const mensagem = 'A sincronização foi interrompida e pode ser retomada.';
      logger.error('Falha ao sincronizar localização dos livros do sebo:', error);
      const marcado = await marcarErro(seboRef, versao, mensagem, false);
      if (!marcado) return retornarEstadoAtual(seboRef);
      return { status: 'erro', versao, anunciosAtualizados: 0, erro: mensagem };
    }
  };
};

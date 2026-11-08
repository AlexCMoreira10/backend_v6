import { mesmoEnderecoLocalizacao } from '../utils/profileLocation.js';
import { validarAtualizacaoSebo } from '../utils/seboValidation.js';

const erroComStatus = (status, mensagem) => {
  const error = new Error(mensagem);
  error.status = status;
  return error;
};

export const criarAtualizadorSebo = ({
  db,
  deleteField,
  sincronizarLocalizacao,
  now = () => new Date()
}) => async (uid, body) => {
  const seboRef = db.collection('sebos').doc(uid);
  const atualizacao = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(seboRef);
    if (!snapshot.exists) return null;
    const anterior = snapshot.data();
    const validacao = validarAtualizacaoSebo(body, anterior);
    if (validacao.erro) throw erroComStatus(400, validacao.erro);

    const enderecoAtualizado = validacao.atualizacao.endereco || anterior.endereco;
    const enderecoMudou = !mesmoEnderecoLocalizacao(anterior.endereco, enderecoAtualizado);
    const atualizadoEm = now();
    const versao = Number(anterior.localizacaoVersao) || 0;
    transaction.update(seboRef, {
      ...validacao.atualizacao,
      atualizadoEm,
      ...(enderecoMudou
        ? {
            geocode: deleteField(),
            localizacaoVersao: versao + 1,
            localizacaoSyncStatus: 'pendente',
            localizacaoSyncErro: deleteField(),
            localizacaoSyncCursor: deleteField(),
            localizacaoSyncAtualizadoEm: atualizadoEm
          }
        : {})
    });
    return {
      enderecoMudou,
      perfil: { ...anterior, ...validacao.atualizacao, atualizadoEm }
    };
  });

  if (!atualizacao) return null;
  if (!atualizacao.enderecoMudou) {
    return { ...atualizacao.perfil, sincronizacaoLocalizacao: null };
  }

  const sincronizacaoLocalizacao = await sincronizarLocalizacao(uid);
  const seboAtualizado = await seboRef.get();
  return {
    id: seboAtualizado.id,
    ...seboAtualizado.data(),
    sincronizacaoLocalizacao
  };
};

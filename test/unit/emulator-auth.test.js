import assert from 'node:assert/strict';
import test from 'node:test';
import { criarMiddlewareAutenticacaoSebo } from '../firestore-emulator/auth.js';

const respostaFalsa = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const montarAutenticacao = ({
  tokenClaims,
  exists = true,
  precisaTrocarSenha = false
} = {}) => {
  const chamadasVerificacao = [];
  const auth = {
    async verifyIdToken(token) {
      chamadasVerificacao.push(token);
      if (token !== 'valid-emulator-id-token') throw new Error('invalid token');
      return tokenClaims || { uid: 'manager-1' };
    }
  };
  const db = {
    collection(nome) {
      return {
        doc(id) {
          return {
            async get() {
              if (nome === 'sebos') return { exists };
              return {
                exists,
                data: () => ({
                  ativo: true,
                  uid: 'staff-uid',
                  seboId: id === 'staff-1' ? 'manager-1' : id,
                  precisaTrocarSenha
                })
              };
            }
          };
        }
      };
    }
  };
  return {
    ...criarMiddlewareAutenticacaoSebo({ auth, db }),
    chamadasVerificacao
  };
};

test('test authentication requires a Bearer token and verifies it through Admin Auth', async () => {
  const { verificarTokenSebo, chamadasVerificacao } = montarAutenticacao();
  const req = { get: () => undefined };
  const res = respostaFalsa();
  let nextCalled = false;

  await verificarTokenSebo(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.deepEqual(chamadasVerificacao, []);

  const reqArbitrario = { get: () => 'Bearer arbitrary-token' };
  const resArbitrario = respostaFalsa();
  await verificarTokenSebo(reqArbitrario, resArbitrario, () => { nextCalled = true; });
  assert.equal(resArbitrario.statusCode, 401);
  assert.deepEqual(chamadasVerificacao, ['arbitrary-token']);
});

test('verified manager tokens require a sebo profile; common users are forbidden', async () => {
  const { verificarTokenSebo } = montarAutenticacao({ exists: false });
  const req = { get: () => 'Bearer valid-emulator-id-token' };
  const res = respostaFalsa();
  let nextCalled = false;

  await verificarTokenSebo(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);

  const managerAuth = montarAutenticacao();
  const managerReq = { get: () => 'Bearer valid-emulator-id-token' };
  const managerRes = respostaFalsa();
  await managerAuth.verificarTokenSebo(managerReq, managerRes, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(managerReq.seboId, 'manager-1');
  assert.equal(managerReq.subconta, null);
});

test('staff identity is validated and blocked from manager-only endpoints', async () => {
  const { verificarTokenSebo, exigirGestorSebo } = montarAutenticacao({
    tokenClaims: {
      uid: 'staff-uid',
      accountType: 'sebo_staff',
      staffId: 'staff-1',
      seboId: 'manager-1'
    }
  });
  const req = { get: () => 'Bearer valid-emulator-id-token' };
  const res = respostaFalsa();
  let nextCalled = false;

  await verificarTokenSebo(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.seboId, 'manager-1');

  nextCalled = false;
  exigirGestorSebo(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('staff accounts that must change their password remain blocked', async () => {
  const { verificarTokenSebo } = montarAutenticacao({
    precisaTrocarSenha: true,
    tokenClaims: {
      uid: 'staff-uid',
      accountType: 'sebo_staff',
      staffId: 'staff-1',
      seboId: 'manager-1'
    }
  });
  const req = { get: () => 'Bearer valid-emulator-id-token' };
  const res = respostaFalsa();
  let nextCalled = false;

  await verificarTokenSebo(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.erro, 'Troque a senha temporária antes de continuar');
  assert.equal(nextCalled, false);
});

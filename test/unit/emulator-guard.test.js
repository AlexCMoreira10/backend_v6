import assert from 'node:assert/strict';
import test from 'node:test';
import { validarAmbienteEmulador } from '../firestore-emulator/guard.js';

const ambienteValido = Object.freeze({
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  GCLOUD_PROJECT: 'demo-estante-babel'
});

test('emulator guard accepts only the fictitious project and loopback emulator hosts', () => {
  assert.doesNotThrow(() => validarAmbienteEmulador(ambienteValido));
  assert.throws(
    () => validarAmbienteEmulador({ ...ambienteValido, GCLOUD_PROJECT: 'babel-5dcbd' }),
    /GCLOUD_PROJECT/
  );
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443'
    }),
    /FIRESTORE_EMULATOR_HOST/
  );
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_AUTH_EMULATOR_HOST: 'auth.googleapis.com:443'
    }),
    /FIREBASE_AUTH_EMULATOR_HOST/
  );
});

test('emulator guard rejects missing emulator hosts and production project overrides', () => {
  const { FIREBASE_AUTH_EMULATOR_HOST: _auth, ...withoutAuth } = ambienteValido;
  assert.throws(() => validarAmbienteEmulador(withoutAuth), /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_PROJECT_ID: 'babel-5dcbd'
    }),
    /FIREBASE_PROJECT_ID/
  );
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_CONFIG: JSON.stringify({ projectId: 'babel-5dcbd' })
    }),
    /FIREBASE_CONFIG/
  );
  assert.doesNotThrow(() => validarAmbienteEmulador({
    ...ambienteValido,
    FIREBASE_CONFIG: JSON.stringify({
      projectId: 'demo-estante-babel',
      databaseURL: 'https://demo-estante-babel.firebaseio.com'
    })
  }));
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'demo-estante-babel',
        databaseURL: 'https://babel-5dcbd.firebaseio.com'
      })
    }),
    /databaseURL/
  );
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'demo-estante-babel',
        databaseURL: 'https://untrusted.example'
      })
    }),
    /databaseURL/
  );
  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'demo-estante-babel',
        authDomain: 'babel-5dcbd.firebaseapp.com'
      })
    }),
    /authDomain/
  );
});

test('emulator guard rejects credentials and credential-bearing Firebase config', () => {
  for (const variable of [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_SERVICE_ACCOUNT',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
    'GOOGLE_CLOUD_KEYFILE_JSON',
    'GCLOUD_KEY_FILE'
  ]) {
    assert.throws(
      () => validarAmbienteEmulador({ ...ambienteValido, [variable]: 'configured' }),
      new RegExp(variable)
    );
  }

  assert.throws(
    () => validarAmbienteEmulador({
      ...ambienteValido,
      FIREBASE_CONFIG: JSON.stringify({
        projectId: 'demo-estante-babel',
        privateKey: 'not-a-real-key'
      })
    }),
    /não pode conter credenciais/
  );
});

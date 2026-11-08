const PROJECT_ID = 'demo-estante-babel';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const credentialVariables = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_SERVICE_ACCOUNT',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_CLOUD_KEYFILE_JSON',
  'GCLOUD_KEY_FILE'
];

export const validarAmbienteEmulador = (env = process.env) => {
  if (env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `Testes de integração bloqueados: FIRESTORE_EMULATOR_HOST deve ser ${FIRESTORE_EMULATOR_HOST}.`
    );
  }

  if (env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR_HOST) {
    throw new Error(
      `Testes de integração bloqueados: FIREBASE_AUTH_EMULATOR_HOST deve ser ${AUTH_EMULATOR_HOST}.`
    );
  }

  if (env.GCLOUD_PROJECT !== PROJECT_ID) {
    throw new Error(
      `Testes de integração bloqueados: GCLOUD_PROJECT deve ser ${PROJECT_ID}.`
    );
  }

  for (const nome of ['FIREBASE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[nome] && env[nome] !== PROJECT_ID) {
      throw new Error(
        `Testes de integração bloqueados: ${nome} deve ser ${PROJECT_ID}.`
      );
    }
  }

  if (env.FIREBASE_CONFIG) {
    let config;
    try {
      config = JSON.parse(env.FIREBASE_CONFIG);
    } catch {
      throw new Error('Testes de integração bloqueados: FIREBASE_CONFIG é inválido.');
    }
    if (config.projectId !== PROJECT_ID) {
      throw new Error(
        `Testes de integração bloqueados: FIREBASE_CONFIG deve usar ${PROJECT_ID}.`
      );
    }
    if ([
      'credential',
      'serviceAccount',
      'privateKey',
      'private_key',
      'privateKeyId',
      'clientEmail',
      'client_id'
    ].some(key => key in config)) {
      throw new Error(
        'Testes de integração bloqueados: FIREBASE_CONFIG não pode conter credenciais.'
      );
    }
    if (config.databaseURL) {
      if (config.databaseURL !== `https://${PROJECT_ID}.firebaseio.com`) {
        throw new Error(
          'Testes de integração bloqueados: databaseURL deve corresponder ao valor demo gerado pela Firebase CLI.'
        );
      }
    }
    if (config.authDomain &&
        !['demo-estante-babel.firebaseapp.com', 'demo-estante-babel.local']
          .includes(config.authDomain)) {
      throw new Error(
        'Testes de integração bloqueados: authDomain deve pertencer ao projeto demo.'
      );
    }
    if (config.storageBucket &&
        !['demo-estante-babel.appspot.com', 'demo-estante-babel.firebasestorage.app']
          .includes(config.storageBucket)) {
      throw new Error(
        'Testes de integração bloqueados: storageBucket deve pertencer ao projeto demo.'
      );
    }
  }

  const credencialConfigurada = credentialVariables.find(nome => env[nome]);
  if (credencialConfigurada) {
    throw new Error(
      `Testes de integração bloqueados: remova ${credencialConfigurada}; credenciais externas não são permitidas.`
    );
  }
};

validarAmbienteEmulador();

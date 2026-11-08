import { validarAmbienteEmulador } from './guard.js';

validarAmbienteEmulador();
process.env.FIREBASE_PROJECT_ID = 'demo-estante-babel';

const [
  { initializeApp },
  { getAuth },
  { getFirestore, FieldValue, FieldPath }
] = await Promise.all([
  import('firebase-admin/app'),
  import('firebase-admin/auth'),
  import('firebase-admin/firestore')
]);

export const app = initializeApp({ projectId: 'demo-estante-babel' }, 'firestore-emulator-tests');
export const auth = getAuth(app);
export const db = getFirestore(app);
export { FieldPath, FieldValue };

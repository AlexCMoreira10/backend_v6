import admin from 'firebase-admin';
import { createRequire } from 'module';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_PATH não está definido. Crie um arquivo .env com o caminho para serviceAccountKey.json'
  );
}

const resolvedPath = path.isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : path.resolve(process.cwd(), serviceAccountPath);

const serviceAccount = require(resolvedPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🔥 Exporta o admin completo
export default admin;

// (Opcional) exporta o db separado se quiser
export const db = admin.firestore();

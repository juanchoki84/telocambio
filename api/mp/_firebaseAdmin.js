import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getRequiredEnv } from "./_env.js";

function decodeServiceAccount() {
  const serviceAccountBase64 = getRequiredEnv("FIREBASE_SERVICE_ACCOUNT_BASE64");

  try {
    const json = Buffer.from(serviceAccountBase64, "base64").toString("utf8");
    const serviceAccount = JSON.parse(json);

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        "El service account no tiene project_id, client_email o private_key."
      );
    }

    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

    return serviceAccount;
  } catch (error) {
    throw new Error(
      `No se pudo decodificar FIREBASE_SERVICE_ACCOUNT_BASE64. Verificá que sea el JSON completo convertido a base64. Detalle: ${error.message}`
    );
  }
}

export function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const databaseURL = getRequiredEnv("FIREBASE_DATABASE_URL");

  return initializeApp({
    credential: cert(decodeServiceAccount()),
    databaseURL,
  });
}

export function getAdminDatabase() {
  return getDatabase(getFirebaseAdminApp());
}

export async function verifyFirebaseUser(req) {
  const authorization =
    req.headers.authorization || req.headers.Authorization || "";

  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    const error = new Error("No se recibió token de Firebase.");
    error.statusCode = 401;
    throw error;
  }

  const decodedToken = await getAuth(getFirebaseAdminApp()).verifyIdToken(token);

  if (!decodedToken?.uid) {
    const error = new Error("Token de Firebase inválido.");
    error.statusCode = 401;
    throw error;
  }

  return decodedToken;
}

export function sendMethodNotAllowed(res) {
  res.setHeader("Allow", "POST");
  return res.status(405).json({ error: "Método no permitido." });
}

export function sendApiError(res, error) {
  const statusCode = error?.statusCode || error?.status || 500;
  const message = error?.message || "Error interno del servidor.";

  console.error("[TeLoCambio API]", error);

  return res.status(statusCode).json({ error: message });
}
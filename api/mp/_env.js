import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
  override: false,
});

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  override: false,
});

export function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Falta ${name} en las variables de entorno.`);
  }

  return value.trim();
}

export function getOptionalEnv(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : "";
}
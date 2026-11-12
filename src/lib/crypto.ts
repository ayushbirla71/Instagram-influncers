import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for influencers' stored access tokens. Format: base64(iv).base64(tag).base64(ciphertext)

function key(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32");
  }
  if (process.env.NODE_ENV === "production" && /^0+$/.test(hex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY is the all-zero placeholder; set a real key in production");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** URL-safe random token for invite links and OAuth state. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

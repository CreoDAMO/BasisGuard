import crypto from "node:crypto";

// Static salt — we're KDF-ing SESSION_SECRET so this is fine
const KDF_SALT = "basisguard-coinbase-enc-v1";

function getDerivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "dev-only-fallback-do-not-use-in-production";
  return crypto.scryptSync(secret, KDF_SALT, 32);
}

export function encrypt(plaintext: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = getDerivedKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

import crypto from "node:crypto";

// Static salt — we're KDF-ing SESSION_SECRET so this is fine
const KDF_SALT = "basisguard-coinbase-enc-v1";

function getDerivedKey(): Buffer {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    // Fail hard — a missing SESSION_SECRET means credentials stored with the
    // fallback key are silently using a publicly-known value.  Refuse to start.
    throw new Error(
      "SESSION_SECRET environment variable is required but was not set. " +
        "Set it to a strong random value before running the server.",
    );
  }
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

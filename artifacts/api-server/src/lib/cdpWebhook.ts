import {
  createPrivateKey,
  createSign,
  randomBytes,
  sign as nodeSign,
  type KeyObject,
} from "node:crypto";

export const KEY_FILE_MAX = 12_000;

export const CHECKOUT_EVENTS = [
  "checkout.payment.success",
  "checkout.payment.failed",
  "checkout.payment.expired",
  "checkout.refund.success",
  "checkout.refund.failed",
] as const;

export const CDP_WEBHOOK_HOST = "api.cdp.coinbase.com";
export const CDP_WEBHOOK_PATH = "/platform/v2/data/webhooks/subscriptions";

export const DEFAULT_INBOX = "https://basisguard-api.onrender.com/api/billing/webhook";

export type CdpKeyFile = {
  keyId: string;
  secret: string;
};

export type CreatedWebhook = {
  id: string;
  secret: string;
  sandbox: boolean;
  targetUrl: string;
  events: string[];
};

export function unwrapEnvValue(raw: string) {
  let text = raw.replace(/^\uFEFF/, "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  return text.trim().replace(/\\n/g, "\n");
}

function extractPemBlock(text: string) {
  const match = text.match(/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/);
  return match?.[0] ?? null;
}

function normalizePem(secret: string) {
  let text = unwrapEnvValue(secret).replace(/\r\n/g, "\n");
  if (text.includes("BEGIN") && !text.includes("\n")) {
    text = text
      .replace(/(-----BEGIN [A-Z0-9 ]+-----)/, "$1\n")
      .replace(/(-----END [A-Z0-9 ]+-----)/, "\n$1\n");
  }
  return text.trim();
}

function parseLooseKeyFile(text: string): CdpKeyFile | null {
  const keyId = (text.match(/"(?:name|id|apiKeyId|keyId)"\s*:\s*"([^"]+)"/)?.[1] ?? "").trim();
  const pem = extractPemBlock(text);
  const quoted = text.match(/"(?:privateKey|secret|apiKeySecret)"\s*:\s*"((?:\\.|[^"\\])*)"/)?.[1];
  const secret = pem ?? (quoted ? quoted.replace(/\\n/g, "\n").trim() : "");
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

export function parseCdpKeyFile(raw: string): CdpKeyFile {
  const text = unwrapEnvValue(raw);
  if (!text) throw new Error("Paste the CDP key file (the JSON Coinbase showed once).");

  if (text.startsWith("{") || text.includes('"privateKey"') || text.includes('"name"')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const keyId = String(parsed.name ?? parsed.id ?? parsed.apiKeyId ?? parsed.keyId ?? parsed.keyName ?? "").trim();
      const secret = unwrapEnvValue(String(parsed.privateKey ?? parsed.secret ?? parsed.apiKeySecret ?? parsed.private_key ?? ""));
      if (!keyId || !secret) {
        throw new Error("Need both id/name and privateKey. The portal download is one JSON blob.");
      }
      return { keyId, secret };
    } catch (err) {
      const loose = parseLooseKeyFile(text);
      if (loose) return loose;
      if (err instanceof Error && err.message.startsWith("Need both")) throw err;
      throw new Error("That JSON did not parse. Copy the whole key file, not a screenshot.");
    }
  }

  throw new Error(
    "Paste the whole JSON key file. A PEM block alone is not enough — Coinbase needs the key id in the same blob.",
  );
}

function ed25519FromSeed(seed: Buffer) {
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed.subarray(0, 32)]);
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return { key, alg: "EdDSA" as const };
}

export function cdpSecretShape(secret: string) {
  const text = unwrapEnvValue(secret);
  if (!text) return "empty";
  if (text.startsWith("{")) return `JSON (${text.length} chars)`;
  if (text.includes("BEGIN")) return "PEM";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return "UUID (a key id, not a private key)";
  }
  if (/^(0x)?[0-9a-fA-F]+$/.test(text.replace(/\s/g, ""))) {
    return `hex (${text.length} chars)`;
  }
  return `opaque (${text.length} chars, no PEM headers)`;
}

function tryImportBinary(buf: Buffer): { key: KeyObject; alg: "ES256" | "EdDSA" } | null {
  if (buf.length === 32 || buf.length === 64) {
    return ed25519FromSeed(buf);
  }
  if (buf.length > 16) {
    for (const type of ["pkcs8", "sec1"] as const) {
      try {
        const key = createPrivateKey({ key: buf, format: "der", type });
        return { key, alg: key.asymmetricKeyType === "ed25519" ? "EdDSA" : "ES256" };
      } catch {
        /* try next DER type */
      }
    }
  }
  return null;
}

export function importCdpSecret(secret: string): { key: KeyObject; alg: "ES256" | "EdDSA" } {
  let trimmed = unwrapEnvValue(secret);
  if (trimmed.startsWith("{") || trimmed.includes('"privateKey"')) {
    trimmed = parseCdpKeyFile(trimmed).secret;
  }

  const pem = normalizePem(trimmed);
  if (pem.includes("BEGIN")) {
    try {
      const key = createPrivateKey(pem);
      if (key.asymmetricKeyType === "ed25519") return { key, alg: "EdDSA" };
      return { key, alg: "ES256" };
    } catch {
      throw new Error("PEM private key did not import. Keep the BEGIN/END lines.");
    }
  }

  const compact = trimmed.replace(/\s+/g, "");
  const hexBody = compact.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hexBody) && (hexBody.length === 64 || hexBody.length === 128)) {
    return ed25519FromSeed(Buffer.from(hexBody, "hex"));
  }

  // Default CDP keys (Feb 2025+) are Ed25519: base64 of 32-byte seed or 64-byte seed+pub.
  const b64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const imported = tryImportBinary(Buffer.from(padded, "base64"));
    if (imported) return imported;
  } catch {
    /* fall through to the shape error */
  }

  const shape = cdpSecretShape(secret);
  throw new Error(
    `Secret is ${shape}. Not a PEM and not a 32/64-byte Ed25519 blob. ` +
      (shape.startsWith("UUID")
        ? "That UUID is the key id. Upload the JSON Coinbase downloaded — it has both the id and the private key."
        : "Upload the JSON Coinbase downloaded. Default CDP keys are Ed25519 (base64), not a PEM."),
  );
}

export function signCdpJwt(opts: {
  keyId: string;
  secret: string;
  method: string;
  host: string;
  path: string;
}): string {
  const { key, alg } = importCdpSecret(opts.secret);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const header = Buffer.from(JSON.stringify({ alg, typ: "JWT", kid: opts.keyId, nonce })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: opts.keyId,
      iss: "cdp",
      nbf: now,
      exp: now + 120,
      uri: `${opts.method} ${opts.host}${opts.path}`,
    }),
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;

  let signature: Buffer;
  if (alg === "EdDSA") {
    signature = nodeSign(null, Buffer.from(signingInput), key);
  } else {
    const signer = createSign("SHA256");
    signer.update(signingInput);
    signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  }
  return `${signingInput}.${signature.toString("base64url")}`;
}

export function pickWebhookSecret(body: Record<string, unknown>): { id: string; secret: string } {
  const metadata = body.metadata as Record<string, unknown> | undefined;
  const nested = body.subscription as Record<string, unknown> | undefined;
  const nestedMeta = nested?.metadata as Record<string, unknown> | undefined;
  const secret = String(metadata?.secret ?? nestedMeta?.secret ?? body.secret ?? "").trim();
  const id = String(body.id ?? nested?.id ?? body.subscriptionId ?? "").trim();
  return { id, secret };
}

export function webhookInbox(): string {
  const api = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (api && /^https:\/\//i.test(api)) return `${api}/api/billing/webhook`;
  return DEFAULT_INBOX;
}

export function envCdpKey(): CdpKeyFile | null {
  const rawId = unwrapEnvValue(
    process.env.COINBASE_BUSINESS_KEY_NAME ?? process.env.COINBASE_BUSINESS_KEY_ID ?? "",
  );
  const rawSecret = unwrapEnvValue(process.env.COINBASE_BUSINESS_PRIVATE_KEY ?? "");
  if (!rawId && !rawSecret) return null;

  for (const candidate of [rawSecret, rawId]) {
    if (candidate.startsWith("{") || candidate.includes('"privateKey"') || candidate.includes('"name"')) {
      try {
        return parseCdpKeyFile(candidate);
      } catch {
        /* try the pair of env vars */
      }
    }
  }

  if (!rawId || !rawSecret) return null;
  return { keyId: rawId, secret: normalizePem(rawSecret) };
}

export function describeEnvCdpKey() {
  try {
    const parsed = envCdpKey();
    if (!parsed) return { attached: false, canSign: false };
    importCdpSecret(parsed.secret);
    return { attached: true, canSign: true };
  } catch {
    return { attached: true, canSign: false };
  }
}

export function hasWebhookSecret() {
  return Boolean(process.env.COINBASE_BUSINESS_WEBHOOK_SECRET?.trim());
}

export async function createCheckoutWebhook(opts: {
  keyId: string;
  secret: string;
  sandbox?: boolean;
  targetUrl?: string;
}): Promise<CreatedWebhook> {
  const path = CDP_WEBHOOK_PATH;
  const host = CDP_WEBHOOK_HOST;
  const jwt = signCdpJwt({
    keyId: opts.keyId,
    secret: opts.secret,
    method: "POST",
    host,
    path,
  });
  const targetUrl = opts.targetUrl?.trim() || webhookInbox();
  const payload: Record<string, unknown> = {
    description: opts.sandbox ? "BasisGuard sandbox checkout" : "BasisGuard (basisguard.site) checkout",
    eventTypes: [...CHECKOUT_EVENTS],
    target: { url: targetUrl, method: "POST" },
    isEnabled: true,
  };
  if (opts.sandbox) payload.labels = { sandbox: "true" };

  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 240) };
  }
  if (!res.ok) {
    const msg = String(body.message ?? body.error ?? body.title ?? "").trim() || `Coinbase ${res.status}`;
    throw new Error(msg);
  }
  const picked = pickWebhookSecret(body);
  if (!picked.secret) {
    throw new Error(
      "Coinbase created the subscription but did not return metadata.secret. List subscriptions in CDP to retrieve it.",
    );
  }
  return {
    id: picked.id,
    secret: picked.secret,
    sandbox: Boolean(opts.sandbox),
    targetUrl,
    events: [...CHECKOUT_EVENTS],
  };
}

export function deskKeyConfigured() {
  return Boolean(process.env.DESK_KEY?.trim());
}

export function isDeskAuthorized(request: Request) {
  const expected = process.env.DESK_KEY?.trim();
  if (!expected) return true;
  const header = request.headers.get("x-desk-key") ?? request.headers.get("x-ssdf-desk") ?? "";
  if (header && header === expected) return true;
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === "bg_desk_key") {
      try {
        if (decodeURIComponent(rest.join("=")) === expected) return true;
      } catch {
        if (rest.join("=") === expected) return true;
      }
    }
  }
  return false;
}

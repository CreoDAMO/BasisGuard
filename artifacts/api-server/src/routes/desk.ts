/**
 * Operator desk — phone wire for Coinbase Business webhook registration.
 *
 * Public (gated by DESK_KEY when that env is set):
 *   GET  /desk/status
 *   POST /desk/webhook  — upload/paste CDP JSON, Coinbase returns metadata.secret
 *
 * Keys sign one request and are not stored.
 */
import { Router, type Request, type Response } from "express";
import {
  KEY_FILE_MAX,
  createCheckoutWebhook,
  describeEnvCdpKey,
  envCdpKey,
  hasWebhookSecret,
  parseCdpKeyFile,
  webhookInbox,
  deskKeyConfigured,
} from "../lib/cdpWebhook.js";

const router = Router();

function headerValue(req: Request, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

function isDeskAuthorized(req: Request): boolean {
  const expected = process.env.DESK_KEY?.trim();
  if (!expected) return true;
  const header = headerValue(req, "x-desk-key") || headerValue(req, "x-ssdf-desk");
  if (header && header === expected) return true;
  const cookie = headerValue(req, "cookie");
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

router.get("/desk/status", (req, res) => {
  const env = describeEnvCdpKey();
  res.json({
    inbox: webhookInbox(),
    live: process.env.NODE_ENV === "production",
    gated: deskKeyConfigured(),
    authorized: isDeskAuthorized(req),
    hasEnvKeys: env.canSign,
    hasWebhookSecret: hasWebhookSecret(),
  });
});

router.post("/desk/webhook", async (req: Request, res: Response) => {
  if (!isDeskAuthorized(req)) {
    res.status(401).json({ error: "Desk key required" });
    return;
  }

  const body = (req.body ?? {}) as {
    keyFile?: string;
    useEnv?: boolean;
    sandbox?: boolean;
    targetUrl?: string;
  };
  const keyFile = typeof body.keyFile === "string" ? body.keyFile : "";
  if (keyFile.length > KEY_FILE_MAX) {
    res.status(400).json({ error: "That file is too large. Use the JSON Coinbase downloaded." });
    return;
  }

  let key;
  try {
    if (body.useEnv) {
      key = envCdpKey();
      if (!key) throw new Error("No Coinbase Business key is attached on the server.");
    } else {
      key = parseCdpKeyFile(keyFile);
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Bad key file" });
    return;
  }

  try {
    const created = await createCheckoutWebhook({
      keyId: key.keyId,
      secret: key.secret,
      sandbox: Boolean(body.sandbox),
      targetUrl: typeof body.targetUrl === "string" ? body.targetUrl : webhookInbox(),
    });
    res.json(created);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Coinbase rejected the create." });
  }
});

export default router;

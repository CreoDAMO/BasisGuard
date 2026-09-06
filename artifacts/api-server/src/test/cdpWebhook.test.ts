import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { parseCdpKeyFile, pickWebhookSecret, signCdpJwt, importCdpSecret } from "../lib/cdpWebhook.js";

describe("parseCdpKeyFile", () => {
  it("reads name + privateKey from the Coinbase JSON download", () => {
    const parsed = parseCdpKeyFile(
      JSON.stringify({
        name: "organizations/abc/apiKeys/def",
        privateKey: "-----BEGIN EC PRIVATE KEY-----\\nMHcCAQEE\\n-----END EC PRIVATE KEY-----",
      }),
    );
    expect(parsed.keyId).toBe("organizations/abc/apiKeys/def");
    expect(parsed.secret).toMatch(/BEGIN EC PRIVATE KEY/);
    expect(parsed.secret).not.toMatch(/\\n/);
  });

  it("rejects a PEM block with no key id", () => {
    expect(() =>
      parseCdpKeyFile("-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----"),
    ).toThrow(/whole JSON/);
  });
});

describe("pickWebhookSecret", () => {
  it("reads metadata.secret and subscriptionId", () => {
    const picked = pickWebhookSecret({
      subscriptionId: "sub_1",
      metadata: { secret: "hook0-secret" },
    });
    expect(picked.id).toBe("sub_1");
    expect(picked.secret).toBe("hook0-secret");
  });
});

describe("signCdpJwt", () => {
  it("mints an ES256 JWT from a generated EC key", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    importCdpSecret(pem);
    const jwt = signCdpJwt({
      keyId: "organizations/abc/apiKeys/def",
      secret: pem,
      method: "POST",
      host: "api.cdp.coinbase.com",
      path: "/platform/v2/data/webhooks/subscriptions",
    });
    const [header] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(header!, "base64url").toString()) as { alg: string; kid: string };
    expect(decoded.alg).toBe("ES256");
    expect(decoded.kid).toBe("organizations/abc/apiKeys/def");
  });
});

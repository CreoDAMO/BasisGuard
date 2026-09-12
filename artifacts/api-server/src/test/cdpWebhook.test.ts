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

function coinbaseEd25519Download() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const seed = pkcs8.subarray(pkcs8.length - 32);
  const pub = spki.subarray(spki.length - 32);
  const secret = Buffer.concat([seed, pub]).toString("base64");
  const keyId = "organizations/abc/apiKeys/def";
  return {
    keyId,
    secret,
    json: JSON.stringify({ name: keyId, privateKey: secret }),
  };
}

describe("importCdpSecret Ed25519", () => {
  it("imports the default Coinbase download (base64 seed+pub, no PEM)", () => {
    const file = coinbaseEd25519Download();
    const parsed = parseCdpKeyFile(file.json);
    expect(parsed.keyId).toBe(file.keyId);
    expect(importCdpSecret(parsed.secret).alg).toBe("EdDSA");
    const jwt = signCdpJwt({
      keyId: file.keyId,
      secret: parsed.secret,
      method: "POST",
      host: "api.cdp.coinbase.com",
      path: "/platform/v2/data/webhooks/subscriptions",
    });
    const decoded = JSON.parse(Buffer.from(jwt.split(".")[0]!, "base64url").toString()) as { alg: string };
    expect(decoded.alg).toBe("EdDSA");
  });

  it("accepts the whole JSON blob as the secret (desk paste or upload)", () => {
    const file = coinbaseEd25519Download();
    expect(importCdpSecret(file.json).alg).toBe("EdDSA");
  });

  it("imports a 32-byte Ed25519 seed as base64", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
    const seed = pkcs8.subarray(pkcs8.length - 32).toString("base64");
    expect(importCdpSecret(seed).alg).toBe("EdDSA");
  });

  it("still rejects a UUID that is not a private key", () => {
    expect(() => importCdpSecret("87d98ae9-f31f-42ee-9b69-723d3ff9dd77")).toThrow(/UUID/);
  });
});

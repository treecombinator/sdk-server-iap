/**
 * Minimal JWS/JWT helpers over Web Crypto — enough for the two store APIs:
 * ES256 (Apple App Store Server API) and RS256 (Google service-account OAuth).
 * No verification here: these sign OUR outbound requests; inbound store payloads
 * are decoded only (trust comes from confirming state via the store API over TLS).
 */

const encoder = new TextEncoder();

export function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecodeToString(segment: string): string {
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "===".slice((b64.length + 3) % 4));
}

/** Decode a JWS payload segment. Decoding only — the signature is NOT verified. */
export function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(base64UrlDecodeToString(parts[1]!)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** PEM body (between the BEGIN/END lines) → DER bytes. */
export function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type JwtAlg = "ES256" | "RS256";

const IMPORT_PARAMS: Record<JwtAlg, EcKeyImportParams | RsaHashedImportParams> = {
  ES256: { name: "ECDSA", namedCurve: "P-256" },
  RS256: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
};

const SIGN_PARAMS: Record<JwtAlg, EcdsaParams | AlgorithmIdentifier> = {
  ES256: { name: "ECDSA", hash: "SHA-256" },
  RS256: { name: "RSASSA-PKCS1-v1_5" },
};

/** Import a PKCS#8 PEM private key for signing (Apple .p8 / Google service-account key). */
export function importPrivateKey(pem: string, alg: JwtAlg): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pemToDer(pem) as unknown as ArrayBuffer, IMPORT_PARAMS[alg], false, [
    "sign",
  ]);
}

/**
 * Sign a JWT. For ES256, Web Crypto already emits the raw r||s signature JWS wants;
 * RS256 is plain PKCS#1 v1.5 — no post-processing either way.
 */
export async function signJwt(
  alg: JwtAlg,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: CryptoKey,
): Promise<string> {
  const signingInput = `${base64UrlEncode(JSON.stringify({ alg, ...header }))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(SIGN_PARAMS[alg], key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

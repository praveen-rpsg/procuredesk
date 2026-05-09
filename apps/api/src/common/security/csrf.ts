import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function createCsrfToken(secret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${sign(nonce, secret)}`;
}

export function verifyCsrfToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [nonce, signature] = token.split(".");
  if (!nonce || !signature) return false;
  const expected = sign(nonce, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.byteLength !== expectedBuffer.byteLength) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

function sign(nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(nonce).digest("base64url");
}

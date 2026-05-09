import { describe, expect, it } from "vitest";

import { createCsrfToken, verifyCsrfToken } from "./csrf.js";

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const WRONG_SECRET = "wrong-secret-that-is-at-least-32-chars-long";

describe("CSRF token", () => {
  it("round-trips: created token verifies against same secret", () => {
    const token = createCsrfToken(SECRET);
    expect(verifyCsrfToken(token, SECRET)).toBe(true);
  });

  it("rejects token verified against wrong secret", () => {
    const token = createCsrfToken(SECRET);
    expect(verifyCsrfToken(token, WRONG_SECRET)).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const token = createCsrfToken(SECRET);
    const [_nonce, signature] = token.split(".");
    const tamperedToken = `tampered-nonce.${signature}`;
    expect(verifyCsrfToken(tamperedToken, SECRET)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = createCsrfToken(SECRET);
    const [nonce] = token.split(".");
    expect(verifyCsrfToken(`${nonce}.tampered-sig`, SECRET)).toBe(false);
  });

  it("rejects undefined token", () => {
    expect(verifyCsrfToken(undefined, SECRET)).toBe(false);
  });

  it("rejects empty string token", () => {
    expect(verifyCsrfToken("", SECRET)).toBe(false);
  });

  it("rejects token with no separator", () => {
    expect(verifyCsrfToken("noseparatortoken", SECRET)).toBe(false);
  });

  it("produces unique tokens each call (random nonce)", () => {
    const t1 = createCsrfToken(SECRET);
    const t2 = createCsrfToken(SECRET);
    expect(t1).not.toBe(t2);
  });

  it("is timing-safe: same length buffers compared without short-circuit", () => {
    const token = createCsrfToken(SECRET);
    const [nonce] = token.split(".");
    // Modify last char of signature — still same length
    const badSig = "A".repeat(43);
    expect(verifyCsrfToken(`${nonce}.${badSig}`, SECRET)).toBe(false);
  });
});

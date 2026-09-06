import { describe, expect, it } from "vitest";
import { containsPlaintext, decryptJson, encryptJson } from "../../src/crypto";

describe("encrypted optional values", () => {
  it("encrypts without plaintext and decrypts with the same passphrase", async () => {
    const value = { contact: "架空の連絡事項", assistance: "架空の案内" };
    const payload = await encryptJson(value, "FAKE-strong-passphrase", "2099-01-01T00:00:00Z", 10_000);
    expect(payload.algorithm).toBe("PBKDF2-SHA-256/AES-GCM-256");
    expect(containsPlaintext(payload, Object.values(value))).toBe(false);
    await expect(decryptJson(payload, "FAKE-strong-passphrase")).resolves.toEqual(value);
    await expect(decryptJson(payload, "wrong-passphrase")).rejects.toThrow();
  });

  it("refuses expired values", async () => {
    const payload = await encryptJson({ note: "架空" }, "FAKE-passphrase", "2026-09-04T00:00:00Z", 1_000);
    await expect(decryptJson(payload, "FAKE-passphrase", new Date("2026-09-04T00:00:00Z"))).rejects.toThrow(/期限/);
  });
});

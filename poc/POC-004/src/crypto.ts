export const PBKDF2_ITERATIONS = 600_000;

export interface EncryptedPayload {
  algorithm: "PBKDF2-SHA-256/AES-GCM-256";
  version: 1;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  expiresAt: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (!passphrase) throw new Error("共有パスフレーズは必須です。");
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson(
  value: unknown,
  passphrase: string,
  expiresAt: string,
  iterations = PBKDF2_ITERATIONS
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    algorithm: "PBKDF2-SHA-256/AES-GCM-256",
    version: 1,
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    expiresAt
  };
}

export async function decryptJson<T>(payload: EncryptedPayload, passphrase: string, now = new Date()): Promise<T> {
  if (new Date(payload.expiresAt).getTime() <= now.getTime()) throw new Error("任意項目の保存期限が切れています。");
  const key = await deriveKey(passphrase, fromBase64(payload.salt), payload.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function containsPlaintext(payload: EncryptedPayload, values: readonly string[]): boolean {
  const serialized = JSON.stringify(payload);
  return values.some((value) => value.length > 0 && serialized.includes(value));
}

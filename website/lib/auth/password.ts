import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "crypto";

/**
 * Password hashing with scrypt (memory-hard, OWASP-recommended alongside Argon2id/bcrypt), using
 * Node's built-in crypto, so there is no home-made cryptography and no native dependency.
 * Format: scrypt$N$r$p$salt$hash (self-describing, so parameters can be raised later and old
 * hashes upgraded transparently on the next successful login).
 */
const PARAMS = { N: 2 ** 16, r: 8, p: 2 };
const KEYLEN = 64;

const derive = (password: string, salt: Buffer, o: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((res, rej) => {
    const opts: ScryptOptions = { N: o.N, r: o.r, p: o.p, maxmem: 512 * 1024 * 1024 };
    scrypt(password.normalize("NFKC"), new Uint8Array(salt), KEYLEN, opts, (e, k) => (e ? rej(e) : res(k)));
  });

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return { ok: false, rehash: false };
  const expected = Buffer.from(hash, "base64");
  const got = await derive(password, Buffer.from(salt, "base64"), { N: +N, r: +r, p: +p });
  const ok = got.length === expected.length && timingSafeEqual(new Uint8Array(got), new Uint8Array(expected));
  return { ok, rehash: ok && (+N < PARAMS.N || +r < PARAMS.r || +p < PARAMS.p) };
}

// Used to burn the same CPU time when an email doesn't exist, so response timing doesn't reveal accounts.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-" + randomBytes(8).toString("hex")));

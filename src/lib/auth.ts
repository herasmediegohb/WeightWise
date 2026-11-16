import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ww_session";
export const TZ_COOKIE = "ww_tz";
const MAX_AGE = 60 * 60 * 24 * 90;

/** Auth is on whenever APP_PASSWORD is set. Production refuses to run without it. */
export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function authRequired(): boolean {
  return authConfigured() || process.env.NODE_ENV === "production";
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET || `ww:${process.env.APP_PASSWORD ?? ""}`;
  return new TextEncoder().encode(s);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !authConfigured()) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

/** Constant-time comparison so the password can't be guessed by timing. */
export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

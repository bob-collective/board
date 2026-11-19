import { createRemoteJWKSet, jwtVerify } from "jose";

export const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const SESSION_COOKIE = "board_id";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function username(idToken: string | undefined): Promise<string | null> {
  if (!idToken || !CLIENT_ID) return null;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: CLIENT_ID });
    if (typeof payload.email !== "string") return null;
    if (process.env.GOOGLE_ALLOWED_DOMAIN && payload.hd !== process.env.GOOGLE_ALLOWED_DOMAIN) return null;
    return payload.email.split("@")[0].replace(/[^a-zA-Z0-9-]/g, "-");
  } catch {
    return null;
  }
}

export async function idTokenFor(code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!response.ok) throw new Error(`Google answered ${response.status}: ${await response.text()}`);
  const body: unknown = await response.json();
  if (body && typeof body === "object" && "id_token" in body && typeof body.id_token === "string") return body.id_token;
  throw new Error("Google's answer had no ID token");
}

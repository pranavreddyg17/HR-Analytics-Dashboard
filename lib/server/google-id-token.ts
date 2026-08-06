import { runtimeEnv } from "@/lib/server/runtime-env"

const runtime = runtimeEnv as { GOOGLE_CLIENT_ID?: string }

type GoogleTokenHeader = { alg?: string; kid?: string }
type GoogleTokenPayload = {
  aud?: string | string[]
  email?: string
  email_verified?: boolean
  exp?: number
  iss?: string
  name?: string
  picture?: string
  sub?: string
}

type GoogleJwk = JsonWebKey & { kid?: string; alg?: string }

let cachedKeys: { expiresAt: number; keys: GoogleJwk[] } | null = null

function bytes(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const decoded = atob(padded)
  const buffer = new ArrayBuffer(decoded.length)
  const view = new Uint8Array(buffer)
  for (let index = 0; index < decoded.length; index += 1) view[index] = decoded.charCodeAt(index)
  return buffer
}

function jsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(bytes(value))) as T
}

async function googleKeys(): Promise<GoogleJwk[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs")
  if (!response.ok) throw new Error("Google sign-in verification is unavailable.")
  const body = await response.json() as { keys?: GoogleJwk[] }
  if (!body.keys?.length) throw new Error("Google sign-in verification is unavailable.")
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600)
  cachedKeys = { keys: body.keys, expiresAt: Date.now() + Math.max(300, maxAge) * 1000 }
  return body.keys
}

export async function verifyGoogleIdToken(value: unknown) {
  if (typeof value !== "string" || value.length > 10_000) return null
  const parts = value.split(".")
  if (parts.length !== 3) return null
  const [encodedHeader, encodedPayload, encodedSignature] = parts

  try {
    const header = jsonPart<GoogleTokenHeader>(encodedHeader)
    const payload = jsonPart<GoogleTokenPayload>(encodedPayload)
    if (header.alg !== "RS256" || !header.kid || !runtime.GOOGLE_CLIENT_ID) return null
    const key = (await googleKeys()).find((candidate) => candidate.kid === header.kid)
    if (!key) return null

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    )
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      bytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    )
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    const validIssuer = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com"
    const validExpiry = typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000) - 30
    if (!verified || !validIssuer || !validExpiry || !audience.includes(runtime.GOOGLE_CLIENT_ID)) return null
    if (!payload.sub || !payload.email || payload.email_verified !== true) return null

    return {
      id: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name ?? payload.email,
      image: payload.picture ?? null,
    }
  } catch {
    return null
  }
}

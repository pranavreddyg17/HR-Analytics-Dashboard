export type RequestActor = { email: string; displayName: string }

export function getRequestActor(request: Request): RequestActor | null {
  const email = request.headers.get("oai-authenticated-user-email")
  if (email) {
    const encoded = request.headers.get("oai-authenticated-user-full-name")
    let displayName = email.split("@")[0]
    if (encoded && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
      try { displayName = decodeURIComponent(encoded) } catch { /* use email fallback */ }
    }
    return { email, displayName }
  }
  const hostname = new URL(request.url).hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") return { email: "local-admin@laidbackhr.ai", displayName: "Local HR Admin" }
  return null
}

export function requireRequestActor(request: Request): RequestActor {
  const actor = getRequestActor(request)
  if (!actor) throw new Error("AUTH_REQUIRED")
  return actor
}

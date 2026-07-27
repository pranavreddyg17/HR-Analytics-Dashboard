import { headers } from "next/headers"

export type ChatGPTUser = {
  displayName: string
  email: string
  fullName: string | null
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers()
  const email = requestHeaders.get("oai-authenticated-user-email")
  if (!email) return null
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name")
  const encoding = requestHeaders.get("oai-authenticated-user-full-name-encoding")
  let fullName: string | null = null
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encodedName) } catch { fullName = null }
  }
  return { displayName: fullName ?? email.split("@")[0], email, fullName }
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/"
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safe)}`
}

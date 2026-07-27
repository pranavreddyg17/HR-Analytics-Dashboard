declare module "cloudflare:workers" {
  export const env: Record<string, unknown>
}

interface Fetcher {
  fetch(input: Request): Promise<Response>
}

interface D1Database {
  prepare(sql: string): unknown
}

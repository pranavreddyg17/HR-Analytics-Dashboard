/**
 * Runtime configuration shared by the Cloudflare and Azure builds.
 *
 * Cloudflare's Node.js compatibility layer and Azure App Service both expose
 * application settings through `process.env`. Keeping access in one module
 * prevents hosting-specific imports from leaking into business logic.
 */
export const runtimeEnv = process.env as Record<string, string | undefined>

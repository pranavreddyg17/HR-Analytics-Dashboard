import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

export async function load(url, context, nextLoad) {
  const parsed = new URL(url)
  if (parsed.protocol === "file:" && parsed.pathname.endsWith(".sql")) {
    const source = await readFile(fileURLToPath(parsed), "utf8")
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(source)};` }
  }
  return nextLoad(url, context)
}

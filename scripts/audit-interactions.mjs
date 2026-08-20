import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

const root = process.cwd()
const files = []

async function collect(directory) {
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (/\.tsx$/.test(entry.name)) files.push(path)
  }
}

await collect("components")
await collect("app")

const failures = []
let usesLayoutProjection = false
for (const file of files) {
  const source = await readFile(join(root, file), "utf8")
  if (/\blayout(Id)?\s*=/.test(source) && source.includes("motion/")) usesLayoutProjection = true
  for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
    if (!/\btype\s*=/.test(match[0])) failures.push(`${relative(root, file)}: native button is missing an explicit type`)
  }
  for (const form of source.matchAll(/<form\b[\s\S]*?<\/form>/g)) {
    if (!/\bonSubmit\s*=/.test(form[0])) failures.push(`${relative(root, file)}: form is missing an onSubmit handler`)
    for (const button of form[0].matchAll(/<Button\b[\s\S]*?>/g)) {
      if (!/\btype\s*=/.test(button[0]) && !/\bnativeButton\s*=\{false\}/.test(button[0])) {
        failures.push(`${relative(root, file)}: Button inside a form is missing an explicit type`)
      }
    }
  }
}

if (usesLayoutProjection) {
  const motionFeatures = await readFile(join(root, "components/motion/motion-features.ts"), "utf8")
  if (!/\bdomMax\b/.test(motionFeatures)) {
    failures.push("components/motion/motion-features.ts: layout projection requires the domMax feature bundle")
  }
}

if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log(`Interaction audit passed for ${files.length} TSX files.`)

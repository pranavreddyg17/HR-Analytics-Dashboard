import type { ReactNode } from "react"

type Block =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }

const headingPattern = /^(#{1,6})\s+(.+)$/
const unorderedPattern = /^\s*[-*]\s+(.+)$/
const orderedPattern = /^\s*\d+[.)]\s+(.+)$/
const tableDividerPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/
const inlinePattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? ""
    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.trim().match(headingPattern)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2].trim() })
      index += 1
      continue
    }

    if (index + 1 < lines.length && line.includes("|") && tableDividerPattern.test(lines[index + 1] ?? "")) {
      const headers = tableCells(line)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(tableCells(lines[index] ?? ""))
        index += 1
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    const unordered = line.match(unorderedPattern)
    if (unordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(unorderedPattern)
        if (!match) break
        items.push(match[1].trim())
        index += 1
      }
      blocks.push({ type: "unordered-list", items })
      continue
    }

    const ordered = line.match(orderedPattern)
    if (ordered) {
      const items: string[] = []
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(orderedPattern)
        if (!match) break
        items.push(match[1].trim())
        index += 1
      }
      blocks.push({ type: "ordered-list", items })
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length) {
      const next = lines[index] ?? ""
      if (!next.trim() || headingPattern.test(next.trim()) || unorderedPattern.test(next) || orderedPattern.test(next)) break
      if (index + 1 < lines.length && next.includes("|") && tableDividerPattern.test(lines[index + 1] ?? "")) break
      paragraph.push(next.trim())
      index += 1
    }
    blocks.push({ type: "paragraph", content: paragraph.join(" ") })
  }

  return blocks
}

function inlineContent(content: string): ReactNode[] {
  return content.split(inlinePattern).filter(Boolean).map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.92em]">{part.slice(1, -1)}</code>
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={index}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

export function AssistantRichText({ content }: { content: string }) {
  const blocks = parseBlocks(content)
  return <div className="space-y-3 break-words text-body leading-5">
    {blocks.map((block, index) => {
      if (block.type === "heading") {
        return <h3 key={index} className={block.level <= 3 ? "pt-1 text-subsection font-semibold" : "pt-1 text-card-title font-semibold"}>{inlineContent(block.content)}</h3>
      }
      if (block.type === "unordered-list") {
        return <ul key={index} className="space-y-1.5 pl-5 marker:text-muted-foreground">{block.items.map((item, itemIndex) => <li key={itemIndex} className="list-disc pl-0.5">{inlineContent(item)}</li>)}</ul>
      }
      if (block.type === "ordered-list") {
        return <ol key={index} className="space-y-1.5 pl-5 marker:font-semibold marker:text-muted-foreground">{block.items.map((item, itemIndex) => <li key={itemIndex} className="list-decimal pl-0.5">{inlineContent(item)}</li>)}</ol>
      }
      if (block.type === "table") {
        return <div key={index} className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] border-collapse text-left text-body">
            <thead className="bg-muted/55"><tr>{block.headers.map((header, cellIndex) => <th key={cellIndex} className="border-b border-border px-3 py-2 text-label font-semibold">{inlineContent(header)}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{inlineContent(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      }
      return <p key={index}>{inlineContent(block.content)}</p>
    })}
  </div>
}

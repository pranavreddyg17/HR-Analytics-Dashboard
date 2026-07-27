"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles, CircleDot } from "lucide-react"

import { Button } from "@/components/ui/button"

const titles: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Executive Overview",
    subtitle: "Real analytics from the uploaded attrition dataset",
  },
  "/attrition": {
    title: "Attrition Analytics & ML",
    subtitle: "Live API predictions, model drivers, and validation metrics",
  },
  "/employees": {
    title: "Scored Historical Records",
    subtitle: "Anonymised model review worklist",
  },
  "/ai-agents": {
    title: "Analytics AI",
    subtitle: "Grounded chat and data-derived review actions",
  },
  "/learning": {
    title: "Data & Model",
    subtitle: "Provenance, schema, metrics, and limitations",
  },
}

export function Topbar() {
  const pathname = usePathname()
  const meta = titles[pathname] ?? titles["/"]

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-5 backdrop-blur-md">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold">{meta.title}</h1>
          <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CircleDot className="size-2.5" /> API-backed
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button nativeButton={false} className="gap-1.5" render={<Link href="/ai-agents" />}>
          <Sparkles className="size-4" />
          Ask analytics
        </Button>
      </div>
    </header>
  )
}

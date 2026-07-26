"use client"

import { usePathname } from "next/navigation"
import { Search, Bell, Sparkles, CircleDot } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const titles: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Executive Overview",
    subtitle: "Workforce health and attrition risk at a glance",
  },
  "/attrition": {
    title: "Attrition Analytics & ML",
    subtitle: "Model predictions, drivers, and forecasts",
  },
  "/employees": {
    title: "At-Risk People",
    subtitle: "Prioritized retention worklist with AI suggestions",
  },
  "/ai-agents": {
    title: "AI Agent Hub",
    subtitle: "Autonomous copilot and action queue",
  },
  "/learning": {
    title: "Learning & Skills",
    subtitle: "Upskilling programs tied to retention outcomes",
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
            <CircleDot className="size-2.5" /> Live
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden lg:block">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search people, teams..."
            className="h-9 w-56 rounded-lg bg-card pl-8 text-sm"
          />
        </div>
        <Button variant="outline" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
        </Button>
        <Button className="gap-1.5">
          <Sparkles className="size-4" />
          Ask AI
        </Button>
      </div>
    </header>
  )
}

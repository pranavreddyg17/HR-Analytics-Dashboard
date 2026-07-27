"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  TrendingDown,
  Users,
  Bot,
  Database,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const icons: Record<string, LucideIcon> = {
  LayoutDashboard,
  TrendingDown,
  Users,
  Bot,
  Database,
}

const nav = [
  { href: "/", label: "Overview", icon: "LayoutDashboard" },
  { href: "/attrition", label: "Attrition & ML", icon: "TrendingDown" },
  { href: "/employees", label: "Scored Records", icon: "Users" },
  { href: "/ai-agents", label: "Analytics AI", icon: "Bot" },
  { href: "/learning", label: "Data & Model", icon: "Database" },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <>
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">LaidbackHR.AI</span>
          <span className="text-xs text-muted-foreground">People Intelligence</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <p className="px-3 pb-1 pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Workspace</p>
        {nav.map((item) => {
          const Icon = icons[item.icon]
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-primary/30"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Database className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">IBM HR sample</span>
            <span className="text-xs text-muted-foreground">1,470 historical rows</span>
          </div>
        </div>
      </div>
    </aside>
    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-sidebar-border bg-sidebar/95 p-1.5 shadow-2xl backdrop-blur md:hidden">
      {nav.map((item) => {
        const Icon = icons[item.icon]
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium",
              active ? "bg-sidebar-accent text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="max-w-full truncate">{item.label.replace(" & ML", "")}</span>
          </Link>
        )
      })}
    </nav>
    </>
  )
}

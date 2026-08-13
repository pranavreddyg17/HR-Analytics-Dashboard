export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1380px] space-y-4" aria-label="Loading workspace" role="status">
      <div className="space-y-2 py-3"><div className="h-7 w-40 animate-pulse rounded-md bg-muted"/><div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted"/></div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border border-border bg-card" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
      </div>
      <span className="sr-only">Loading LaidbackHR.AI</span>
    </div>
  )
}

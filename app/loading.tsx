export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5" aria-label="Loading workspace" role="status">
      <div className="h-44 animate-pulse rounded-[28px] bg-card shadow-sm ring-1 ring-foreground/5" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
      <span className="sr-only">Loading LaidbackHR.AI</span>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="workspace-loading mx-auto w-full max-w-[1380px] space-y-4" aria-label="Loading workspace" role="status">
      <div className="space-y-2 py-3"><div className="workspace-loading__bar h-7 w-40 rounded-md"/><div className="workspace-loading__bar h-4 w-72 max-w-full rounded"/></div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="workspace-loading__surface h-24 rounded-xl border border-border bg-card" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="workspace-loading__surface h-72 rounded-xl border border-border bg-card" />
        <div className="workspace-loading__surface h-72 rounded-xl border border-border bg-card" />
      </div>
      <span className="sr-only">Loading LaidbackHR.AI</span>
    </div>
  )
}

export default function PeopleLoading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="h-52 animate-pulse rounded-[28px] bg-muted" />
      <div className="overflow-hidden rounded-[24px] border border-border bg-card">
        <div className="h-20 animate-pulse border-b border-border bg-muted/70" />
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-20 animate-pulse border-b border-border/60 bg-muted/30 last:border-0" />)}
      </div>
    </div>
  )
}

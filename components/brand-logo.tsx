import { cn } from "@/lib/utils"

type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={cn("brand-logo", className)} aria-label="LaidbackHR.AI">
      <span className="brand-logo__mark" aria-hidden="true" />
      <span className="brand-logo__wordmark">
        LaidbackHR<span className="brand-logo__ai">.AI</span>
      </span>
    </span>
  )
}

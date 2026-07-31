import { cn } from "@/lib/utils"

type BrandLogoProps = {
  compact?: boolean
  className?: string
}

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <span className={cn("brand-logo", compact && "brand-logo--compact", className)} aria-label="LaidbackHR.AI">
      <span className="brand-logo__mark" aria-hidden="true">
        <span className="brand-logo__monogram">LH</span>
      </span>
      {!compact && (
        <span className="brand-logo__wordmark">
          LaidbackHR<span className="brand-logo__ai">.AI</span>
        </span>
      )}
    </span>
  )
}

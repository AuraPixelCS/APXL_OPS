import Image from "next/image"
import Link from "next/link"
import logo from "@/public/ap-logo-small.png"
import { cn } from "@/lib/utils"

// AuraPixel mark + "Ops" wordmark. The mark is the shared 512px logo used
// across every AuraPixel project. Imported statically: next/image does NOT
// prepend basePath to string "/public" paths, so a plain src would 404 under /ops.
export function Brand({
  href = "/leads",
  className,
  compact = false,
}: {
  href?: string
  className?: string
  compact?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className
      )}
      aria-label="AuraPixel Ops home"
    >
      <Image
        src={logo}
        alt=""
        width={32}
        height={32}
        priority
        className="size-8 shrink-0 rounded-md"
      />
      {!compact && (
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="font-heading text-[17px] font-semibold tracking-tight">
            AuraPixel
          </span>
          <span className="text-sm font-medium text-brand-bright">Ops</span>
        </span>
      )}
    </Link>
  )
}

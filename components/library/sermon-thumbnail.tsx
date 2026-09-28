"use client";

import { useState } from "react";
import { cn } from "@/lib/client/cn";

/**
 * A sermon's YouTube thumbnail at a fixed 16:9 size. Decorative: the title beside it names the
 * sermon. If YouTube's image can't load, the frame stays as a quiet paper tile instead of a
 * broken-image icon.
 */
export function SermonThumbnail({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const frame = cn("aspect-video shrink-0 rounded-[6px] border border-rule bg-paper-sunk", className);
  if (failed) return <span aria-hidden="true" className={cn(frame, "block")} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn(frame, "object-cover")} />
  );
}

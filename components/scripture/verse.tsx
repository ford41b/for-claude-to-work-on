import { TRANSLATION_LABEL, type FixedVerse } from "@/lib/bible/verses";
import { cn } from "@/lib/client/cn";

/**
 * A quiet Scripture line in the reading serif: the verse as a real quotation (exact public-domain
 * text), the reference and translation beneath it in the Scripture voice.
 */
export function Verse({ verse, size = "md", className }: { verse: FixedVerse; size?: "sm" | "md"; className?: string }) {
  return (
    <figure className={cn("max-w-prose", className)}>
      <blockquote className={cn("reading italic text-ink-muted", size === "sm" ? "text-[0.9375rem] leading-relaxed" : "text-lg leading-relaxed")}>
        <p>{verse.text}</p>
      </blockquote>
      <figcaption className="mt-1.5 text-xs font-semibold text-ink-faint">
        {verse.reference} <span className="font-normal">· {TRANSLATION_LABEL}</span>
      </figcaption>
    </figure>
  );
}

/**
 * DocLink — a small contextual "help" (ⓘ) button that deep-links to the relevant
 * page in the in-portal Documentation (/docs?p=<slug>).
 *
 * Drop one next to any page title or section heading so the team can jump straight
 * to "how this works" without hunting through the docs. Opens in a new tab so they
 * don't lose their place. The slug is the doc's path under /docs (without .md),
 * e.g. "hospital-introduction/automations".
 */
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DocLink({
  slug,
  label = "How this works",
  className = "",
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`/docs?p=${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Documentation: ${label}`}
          className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors shrink-0 ${className}`}
        >
          <HelpCircle className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">{label} — open the guide</span>
      </TooltipContent>
    </Tooltip>
  );
}

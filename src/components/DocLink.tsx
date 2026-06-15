/**
 * DocLink — a small contextual "help" (ⓘ) button that links to the relevant page
 * in the in-portal Documentation (/docs?p=<slug>).
 *
 * Navigates IN-APP (client-side, same tab) rather than opening a new tab — a new
 * tab forces a full fresh boot of the SPA (re-auth, re-load), which is slow and
 * can hang in dev. In-app navigation is instant; the user can hit Back to return
 * to where they were. The slug is the doc's path under /docs (without .md), e.g.
 * "hospital-introduction/automations".
 */
import { Link } from "react-router-dom";
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
        <Link
          to={`/docs?p=${encodeURIComponent(slug)}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Documentation: ${label}`}
          className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors shrink-0 ${className}`}
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">{label} — open the guide</span>
      </TooltipContent>
    </Tooltip>
  );
}

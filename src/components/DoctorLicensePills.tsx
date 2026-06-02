import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LICENSE_META, LICENSE_TONE_CLS, detectLicenses } from "@/lib/license-info";

interface Props {
  has_dha?:      boolean | null;
  has_doh?:      boolean | null;
  has_moh?:      boolean | null;
  license_text?: string | null;
  /** When true, render nothing (instead of "no licenses") if the doctor has
   *  no detectable licenses. Use this in dense rows where empty pills add
   *  noise. */
  hideWhenEmpty?: boolean;
  size?:         "xs" | "sm";
}

/**
 * Hover-explained license chips.
 *
 * Hospitals in this product live across UAE / Saudi / Qatar — each requires a
 * different licensing authority (DHA, DOH, MOH, SCFHS, QCHP). Sales teammates
 * who aren't licensing experts get a tooltip with the full name + which
 * region the licence covers, so they can read the doctor card without
 * googling.
 */
export function DoctorLicensePills({ has_dha, has_doh, has_moh, license_text, hideWhenEmpty, size = "xs" }: Props) {
  const codes = detectLicenses({ has_dha, has_doh, has_moh, license_text });

  if (codes.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <span className="text-[10px] text-muted-foreground italic">no license on file</span>
    );
  }

  const padding = size === "xs" ? "text-[9px] px-1.5 py-0" : "text-[10px] px-2 py-0.5";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="inline-flex items-center gap-1 flex-wrap">
        {codes.map(code => {
          const meta = LICENSE_META[code];
          if (!meta) return null;
          return (
            <Tooltip key={code}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`${LICENSE_TONE_CLS[meta.tone]} ${padding} uppercase tracking-wider font-medium cursor-help`}
                >
                  {meta.code}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px]">
                <div className="text-[11px] font-medium">{meta.fullName}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{meta.region}</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

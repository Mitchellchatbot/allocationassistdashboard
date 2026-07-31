import { cn } from "@/lib/utils";
import { Paperclip } from "lucide-react";

/** Second-level tabs INSIDE a preview pane — the top-level tabs are "Hospital
 *  email" / "Doctor email", and each can hold one tab per doctor profile, since a
 *  multi-doctor send ships a separate email per doctor on both legs.
 *
 *  Every pane stays MOUNTED (inactive ones are just hidden): the editors are
 *  contentEditable surfaces, and unmounting one would drop an in-progress edit
 *  when the user flicks between profiles. Shared by the batch preview + the bulk
 *  combined studio so both edit per doctor identically. */
export function ProfileSubTabs({ names, active, onSelect, panes, markers }: {
  names: string[];
  active: number;
  onSelect: (i: number) => void;
  panes: React.ReactNode[];
  /** When markers[i] is true, a paperclip shows on tab i (this profile has an
   *  attachment). Optional — omit for no markers. */
  markers?: boolean[];
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {names.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
          {names.map((n, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                i === active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/70",
              )}
            >
              {n || `Profile ${i + 1}`}
              {markers?.[i] && <Paperclip className={cn("h-2.5 w-2.5", i === active ? "text-white/90" : "text-teal-600")} />}
            </button>
          ))}
        </div>
      )}
      {panes.map((p, i) => (
        <div key={i} className={cn("min-h-0 min-w-0 flex-1 flex-col", i === active ? "flex" : "hidden")}>{p}</div>
      ))}
    </div>
  );
}

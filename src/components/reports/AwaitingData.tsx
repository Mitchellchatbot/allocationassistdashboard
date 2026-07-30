import { type ReactNode } from "react";
import { DatabaseZap } from "lucide-react";

/**
 * The "render it once we have the data" system for report sections.
 *
 * A lot of the reporting only becomes meaningful once the team has RECORDED the
 * underlying data in the dashboard (marking doctors shortlisted / interviewed /
 * signed / relocated, attributing who did it, etc.). Rather than showing a bare
 * 0 or an empty grid — which reads as "broken" — a section can gate its body on
 * data availability and, when there's none yet, show a friendly placeholder
 * that says it'll populate as the data comes in.
 *
 * Usage:
 *   <DataGate has={rows.length > 0} title="No team activity yet"
 *             note="Populates as your team marks doctors in the dashboard.">
 *     <TeamTable rows={rows} />
 *   </DataGate>
 */
export function AwaitingData({
  title = "No data yet",
  note,
  icon,
  className = "",
}: {
  title?: string;
  note?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-9 px-4 ${className}`}>
      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-2.5 text-slate-400">
        {icon ?? <DatabaseZap className="h-5 w-5" />}
      </div>
      <div className="text-[13px] font-medium text-slate-600">{title}</div>
      {note && (
        <div className="text-[11.5px] text-muted-foreground mt-1 max-w-[440px] leading-relaxed">{note}</div>
      )}
    </div>
  );
}

/** Renders `children` when `has` is true; otherwise the AwaitingData
 *  placeholder. `loading` keeps the body mounted while data is in flight (the
 *  child owns its own skeleton) so it doesn't flash the placeholder first. */
export function DataGate({
  has,
  loading = false,
  title,
  note,
  icon,
  children,
}: {
  has: boolean;
  loading?: boolean;
  title?: string;
  note?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  if (loading || has) return <>{children}</>;
  return <AwaitingData title={title} note={note} icon={icon} />;
}

/**
 * Top of funnel — submissions + outreach coverage.
 *
 * The Reports page jumped straight from raw form-submissions to the
 * hospital-introduction pipeline (profile sends → signed), with no view
 * of what's arriving at the top. This section closes that gap: how many
 * doctors submitted (total / last 7d / 30d) and how far the team has
 * worked them down the outreach funnel (new → contacted → qualified),
 * plus the actionable "uncontacted in Zoho" bucket.
 *
 * Data shape mirrors useFormStats (src/hooks/use-forms.ts ~267) but
 * AGGREGATED across every form instead of one — that hook is per-form
 * and can't be called in a loop without breaking the rules of hooks, so
 * we run the same count-query shape with no form_id filter here. The
 * uncontacted-in-Zoho count reuses the existing uncontacted_zoho_doctor_ids
 * RPC (no args) intersected with form_responses.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Inbox, UserPlus, MailCheck, BadgeCheck, PhoneOff, ArrowRight } from "lucide-react";

export interface TopOfFunnelStats {
  total:              number;
  last7d:             number;
  last30d:            number;
  new:                number;
  contacted:          number;
  qualified:          number;
  uncontactedInZoho:  number;
}

/** Aggregate submission + outreach counters across ALL forms. Same
 *  count-query pattern as useFormStats, minus the per-form filter.
 *  Exported so Reports.tsx can read the headline for the collapsed
 *  trigger badge without re-fetching. */
export function useTopOfFunnelStats() {
  return useQuery({
    queryKey: ["reports-top-of-funnel"],
    queryFn: async (): Promise<TopOfFunnelStats> => {
      const cutoff7  = new Date(Date.now() - 7  * 86_400_000).toISOString();
      const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const head = () => supabase.from("form_responses").select("id", { count: "exact", head: true });
      const [totalRes, last7Res, last30Res, newRes, contactedRes, qualifiedRes, uncontactedIds] = await Promise.all([
        head(),
        head().gte("submitted_at", cutoff7),
        head().gte("submitted_at", cutoff30),
        head().eq("outreach_status", "new"),
        head().eq("outreach_status", "contacted"),
        head().eq("outreach_status", "qualified"),
        // RPC returns the 'lead:<id>' set in Zoho 'Not Contacted'. Count
        // the form_responses that map onto those ids — same definition the
        // Forms page's "uncontacted in Zoho" chip uses, just unscoped.
        supabase.rpc("uncontacted_zoho_doctor_ids"),
      ]);
      const ids = Array.isArray(uncontactedIds.data) ? (uncontactedIds.data as string[]) : [];
      let uncontactedInZoho = 0;
      if (ids.length > 0) {
        const { count } = await supabase
          .from("form_responses")
          .select("id", { count: "exact", head: true })
          .in("doctor_id", ids);
        uncontactedInZoho = count ?? 0;
      }
      return {
        total:             totalRes.count     ?? 0,
        last7d:            last7Res.count      ?? 0,
        last30d:           last30Res.count     ?? 0,
        new:               newRes.count        ?? 0,
        contacted:         contactedRes.count  ?? 0,
        qualified:         qualifiedRes.count  ?? 0,
        uncontactedInZoho,
      };
    },
    staleTime: 60_000,
  });
}

/** Collapsible BODY for the Top-of-funnel section. The CollapsibleSection
 *  shell owns the header + summary badge; this renders the detail tiles. */
export function TopOfFunnelContent({ stats, loading }: { stats?: TopOfFunnelStats; loading: boolean }) {
  if (loading) {
    return <div className="text-[11px] text-muted-foreground py-3">Loading…</div>;
  }
  if (!stats) {
    return (
      <div className="px-2 py-8 text-center text-[12px] text-muted-foreground">
        No submissions yet. Once forms start receiving responses they'll roll up here.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Submissions over time. */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Submissions</div>
        <div className="grid grid-cols-3 gap-3">
          <FunnelTile icon={<Inbox className="h-3.5 w-3.5 text-slate-600" />} label="All time" value={stats.total} />
          <FunnelTile icon={<Inbox className="h-3.5 w-3.5 text-slate-600" />} label="Last 7 days" value={stats.last7d} />
          <FunnelTile icon={<Inbox className="h-3.5 w-3.5 text-slate-600" />} label="Last 30 days" value={stats.last30d} />
        </div>
      </div>

      {/* Outreach funnel. Visual progression new → contacted → qualified,
          then the actionable uncontacted-in-Zoho bucket off to the side. */}
      <div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Outreach funnel</div>
        <div className="flex flex-wrap items-stretch gap-2">
          <FunnelTile icon={<UserPlus  className="h-3.5 w-3.5 text-sky-600" />}      label="New"       value={stats.new} />
          <FunnelStep />
          <FunnelTile icon={<MailCheck className="h-3.5 w-3.5 text-violet-600" />}   label="Contacted" value={stats.contacted} />
          <FunnelStep />
          <FunnelTile icon={<BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />} label="Qualified" value={stats.qualified} />
          <div className="ml-auto">
            <FunnelTile
              icon={<PhoneOff className="h-3.5 w-3.5 text-amber-600" />}
              label="Uncontacted in Zoho"
              value={stats.uncontactedInZoho}
              tone="amber"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelStep() {
  return (
    <div className="flex items-center text-muted-foreground/50 px-0.5">
      <ArrowRight className="h-3.5 w-3.5" />
    </div>
  );
}

function FunnelTile({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone?: "amber";
}) {
  const cls = tone === "amber"
    ? "rounded-lg border border-amber-200 bg-amber-50/40 p-3 min-w-[120px]"
    : "rounded-lg border bg-slate-50/40 p-3 min-w-[110px]";
  return (
    <div className={cls}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
        {icon}{label}
      </div>
      <div className="text-[20px] font-semibold text-slate-900 leading-none mt-2 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

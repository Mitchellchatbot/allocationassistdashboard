import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sun, Sunrise, Sunset, Moon, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useScheduledBatches } from "@/hooks/use-scheduled-batches";
import { useVacancies } from "@/hooks/use-vacancies";

/**
 * Dashboard greeting. Quiet on calm days, useful on busy ones.
 *
 *   - Time-of-day greeting + first name
 *   - One-line agenda summary
 *   - Subtle "time saved" tally under it
 *
 * Earlier version layered chips + inline notifications + a gradient — too
 * many things competing. Trimmed to the essentials: copy is the focus, the
 * top 3 unread notifications surface in the existing PendingActions card
 * below, no need to duplicate them here.
 */
export function DashboardGreeting() {
  const { user, fullName } = useAuth();
  const { data: batches = [] }   = useScheduledBatches();
  const { data: vacancies = [] } = useVacancies();

  const { data: emailsSent = 0 } = useQuery({
    queryKey: ["dashboard-emails-sent"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("automation_flow_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "email_sent");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60_000,
  });

  const greeting = useMemo(() => timeOfDayGreeting(new Date()), []);
  const firstName = useMemo(() => firstNameFrom(fullName, user?.email), [fullName, user?.email]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const batchesToday = batches.filter(b => b.scheduled_for === todayStr && b.status === "draft").length;
  const openVacancies = vacancies.filter(v => v.status === "open").length;

  const hoursSaved = Math.round((emailsSent * 2) / 60);
  const Icon = greeting.icon;

  return (
    <div className="rounded-2xl bg-card border border-border/50 px-5 py-4 mb-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Icon className="h-4 w-4 text-teal-600 shrink-0" />
            {greeting.text}, <span className="text-teal-700">{firstName}</span>.
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1">
            {summarise({ batchesToday, openVacancies })}
          </p>
        </div>
        {emailsSent > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums shrink-0">
            <Sparkles className="h-3 w-3 text-emerald-500" />
            <span><strong className="text-foreground">{emailsSent.toLocaleString()}</strong> auto-emails</span>
            {hoursSaved >= 1 && <span className="text-muted-foreground/70">· ~{hoursSaved.toLocaleString()}h saved</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function timeOfDayGreeting(d: Date): { text: string; icon: typeof Sun } {
  const h = d.getHours();
  if (h < 5)  return { text: "Burning the midnight oil",  icon: Moon };
  if (h < 12) return { text: "Good morning",              icon: Sunrise };
  if (h < 17) return { text: "Good afternoon",            icon: Sun };
  if (h < 21) return { text: "Good evening",              icon: Sunset };
  return       { text: "Good evening",                     icon: Moon };
}

function firstNameFrom(fullName: string | null, email?: string): string {
  if (fullName) return fullName.split(/\s+/)[0];
  const handle = email?.split("@")[0] ?? "";
  if (!handle) return "there";
  const first = handle.split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function summarise({ batchesToday, openVacancies }: {
  batchesToday: number;
  openVacancies: number;
}): React.ReactNode {
  const total = batchesToday + openVacancies;
  if (total === 0) {
    return "All caught up. Nothing urgent today.";
  }
  const parts: Array<{ label: string; to: string }> = [];
  if (batchesToday > 0)  parts.push({ label: `${batchesToday} batch${batchesToday === 1 ? "" : "es"} today`,   to: "/batches" });
  if (openVacancies > 0) parts.push({ label: `${openVacancies} open vacanc${openVacancies === 1 ? "y" : "ies"}`, to: "/vacancies" });
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      On the plate:
      {parts.map((p, i) => (
        <span key={p.label} className="inline-flex items-center gap-1">
          <Link to={p.to} className="text-teal-700 hover:underline font-medium">
            {p.label}
          </Link>
          {i < parts.length - 1 && <span className="text-muted-foreground/40">·</span>}
        </span>
      ))}
      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
    </span>
  );
}

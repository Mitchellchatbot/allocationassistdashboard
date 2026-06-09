/**
 * "Leads to contact & follow-ups due" — the top actionable card on My
 * Workspace. Sourced from form_responses I own (or unowned/new) where a
 * follow-up is overdue or the lead was never contacted. PAID leads
 * ($150 DoctorsFinder, lead_value_cents > 0) are pinned to the top and
 * visually flagged; the page-side query already does the sort.
 *
 * Rows deep-link to /forms so the user lands in the response feed where
 * they can mark contacted, set a follow-up, etc.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { PhoneCall, ChevronRight, ArrowRight, DollarSign, Clock, Mail } from "lucide-react";
import type { WorkspaceLead } from "@/hooks/use-my-workspace";
import { relativeAge, relativeDue } from "@/components/workspace/workspace-time";

export function LeadsToContactCard({ leads, isLoading, scoped }: {
  leads:     WorkspaceLead[];
  isLoading: boolean;
  scoped:    boolean;
}) {
  const navigate = useNavigate();
  const VISIBLE = 8;
  const overflow = leads.length - VISIBLE;

  return (
    <Card data-tour="workspace-leads">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-teal-600" />
              Leads to contact &amp; follow-ups due
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              New leads nobody's reached + follow-ups that are past due. Paid leads come first.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/forms")}>
            Open forms <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="px-4 pb-3"><CardListSkeleton rows={3} /></div>}
        {!isLoading && leads.length === 0 && (
          <EmptyState
            icon={PhoneCall}
            title="No leads waiting"
            body={scoped
              ? "Every lead you own is contacted and no follow-up is due. Nice."
              : "No uncontacted leads or overdue follow-ups across the team."}
            size="sm"
          />
        )}
        {!isLoading && leads.length > 0 && (
          <div className="divide-y divide-border/40">
            {leads.slice(0, VISIBLE).map(l => (
              <LeadRow key={l.id} lead={l} onOpen={() => navigate("/forms")} />
            ))}
            {overflow > 0 && (
              <button
                onClick={() => navigate("/forms")}
                className="w-full px-3 py-2 text-[10px] text-muted-foreground hover:bg-slate-50 text-left transition-colors"
              >
                +{overflow} more lead{overflow === 1 ? "" : "s"} — open Forms to see all →
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadRow({ lead, onOpen }: { lead: WorkspaceLead; onOpen: () => void }) {
  const paid = lead.lead_value_cents > 0;
  const name  = lead.respondent_name ?? lead.respondent_email ?? "(no name)";
  const dollars = Math.round(lead.lead_value_cents / 100);
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
        paid ? "bg-emerald-50/50 hover:bg-emerald-50" : "hover:bg-slate-50"
      }`}
    >
      {paid
        ? <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        : lead.overdue
          ? <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          : <Mail className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-900 truncate flex items-center gap-1.5">
          {name}
          {paid && (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] uppercase tracking-wider">
              Paid · ${dollars}
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {lead.overdue && lead.next_followup_at ? (
            <span className="text-amber-700 font-medium">Follow-up {relativeDue(lead.next_followup_at)}</span>
          ) : (
            <>New lead · submitted {relativeAge(lead.submitted_at)}</>
          )}
          {lead.respondent_email && <> · {lead.respondent_email}</>}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
    </button>
  );
}

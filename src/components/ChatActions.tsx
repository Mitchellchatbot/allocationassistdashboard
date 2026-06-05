/**
 * The agentic half of the AI panel.
 *
 * `ai-insights` may emit one or more `<action type=… label=… params='…'>
 * rationale</action>` blocks at the end of a response. `parseActions`
 * pulls them out of the markdown so the chat bubble renders cleanly,
 * and `ChatActionBar` renders each block as a confirmation button that
 * the user clicks to perform the operation.
 *
 * Each action type maps to a handler below. New action types live in
 * one place: extend the `ACTION_HANDLERS` map.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight, ExternalLink, Search, UserCheck, Send, Workflow, Link2,
  CheckCircle2, Tag, FileText, ClipboardList, Sparkles, Compass, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { zohoPut } from "@/lib/zoho";

export interface ActionSpec {
  type:      string;
  label:     string;
  rationale: string;
  params:    Record<string, unknown>;
}

/** Pulls every complete <action …>rationale</action> tag out of `text`,
 *  returns the cleaned text + the structured actions. Tolerant of the
 *  AI emitting JSON params with embedded quotes by accepting both
 *  single- and double-quoted params attribute. */
export function parseActions(text: string): { text: string; actions: ActionSpec[] } {
  const actions: ActionSpec[] = [];
  // Match `<action type="X" label="Y" params='JSON'>RATIONALE</action>`
  // OR with double-quoted params containing escaped quotes.
  const re = /<action\s+type="([^"]+)"\s+label="([^"]+)"\s+params=(?:'([^']*)'|"([^"]*)")\s*>([\s\S]*?)<\/action>/g;
  const cleaned = text.replace(re, (_, type, label, p1, p2, rationale) => {
    const paramsRaw = (p1 ?? p2 ?? "").trim();
    try {
      const params = paramsRaw ? JSON.parse(paramsRaw) : {};
      actions.push({ type, label, rationale: rationale.trim(), params });
    } catch {
      // malformed JSON — skip silently rather than show raw to the user
    }
    return "";
  }).trim();
  return { text: cleaned, actions };
}

const TYPE_ICON: Record<string, typeof ArrowRight> = {
  goto:                 Compass,
  navigate:             ArrowRight,
  search:               Search,
  open_doctor:          UserCheck,
  open_vacancy:         ClipboardList,
  open_run:             Workflow,
  update_lead_status:   Tag,
  reassign_run:         UserCheck,
  mark_shortlisted:     CheckCircle2,
  send_profile:         Send,
  link_to_vacancy:      Link2,
  create_wp_profile:    Sparkles,
  mark_vacancy_status:  CheckCircle2,
  update_outreach:      FileText,
};

/** Action types that fire automatically without a click. We surface a
 *  countdown chip with a "Stay here" link so the user can cancel
 *  before the route changes. */
const AUTO_FIRE_TYPES = new Set(["goto"]);
const AUTO_FIRE_DELAY_MS = 1200;

export function ChatActionBar({ actions, onActionDone }: {
  actions:       ActionSpec[];
  onActionDone?: (action: ActionSpec) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-1.5 mt-2">
      {actions.map((a, i) => (
        <ActionRow key={i} action={a} onDone={() => onActionDone?.(a)} />
      ))}
    </div>
  );
}

function ActionRow({ action, onDone }: { action: ActionSpec; onDone?: () => void }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [done, setDone]       = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const Icon = TYPE_ICON[action.type] ?? ExternalLink;
  const autoFire = AUTO_FIRE_TYPES.has(action.type);

  const handle = async () => {
    if (pending || done || cancelled) return;
    setPending(true);
    try {
      await dispatch(action, navigate);
      setDone(true);
      onDone?.();
    } catch (e) {
      toast.error("Couldn't do that", { description: (e as Error).message });
    } finally {
      setPending(false);
    }
  };

  // Auto-fire navigation actions after a short delay. The user can hit
  // "Stay here" within the window to abort. We only fire once per
  // ActionRow instance — the firedRef guards against React strict-mode
  // double-mount in dev.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!autoFire || firedRef.current) return;
    firedRef.current = true;
    const t = setTimeout(() => {
      if (!cancelled) handle();
    }, AUTO_FIRE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFire]);

  if (autoFire) {
    return (
      <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Compass className="h-3.5 w-3.5 text-emerald-700 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-emerald-900/80 leading-snug">{action.rationale}</p>
            <p className="text-[10px] text-emerald-700/70 mt-0.5">
              {done       ? `Taken you to ${action.label}.`
                : pending ? "Going…"
                : cancelled ? "Cancelled."
                : `Taking you to ${action.label}…`}
            </p>
          </div>
        </div>
        {!done && !pending && !cancelled && (
          <button
            onClick={() => setCancelled(true)}
            title="Stay on this page"
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] text-emerald-700/80 hover:text-emerald-900 hover:bg-white/60 transition-colors"
          >
            <X className="h-3 w-3" /> Stay
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-3 py-2">
      <p className="text-[11px] text-emerald-900/80 mb-1.5 leading-snug">{action.rationale}</p>
      <button
        onClick={handle}
        disabled={pending || done}
        className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium border transition-colors ${
          done
            ? "bg-emerald-100 border-emerald-300 text-emerald-800"
            : "bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
        }`}
      >
        <Icon className="h-3 w-3" />
        {done ? "Done" : pending ? "Working…" : action.label}
      </button>
    </div>
  );
}

/** Single dispatch point — every action type's effect lives here. Each
 *  handler is responsible for telling the user what happened via toasts
 *  (success/error/info) since the chat bubble itself only shows the
 *  "Done" state. */
async function dispatch(a: ActionSpec, navigate: (to: string) => void): Promise<void> {
  const p = a.params;
  switch (a.type) {
    // `goto` and `navigate` share the same effect — the difference is
    // purely UX: goto auto-fires (the AI is taking you somewhere on
    // your behalf), navigate is a button you click.
    case "goto":
    case "navigate": {
      const path = String(p.path ?? "/");
      navigate(path);
      return;
    }
    case "search": {
      // Universal Search isn't directly invocable from outside React-tree
      // context here; we navigate to the page that hosts it with `?q=`
      // so the search component picks it up — same UX, no event bus.
      const q = encodeURIComponent(String(p.query ?? ""));
      navigate(`/doctors?tab=profiles&q=${q}`);
      return;
    }
    case "open_doctor": {
      const doctorId = String(p.doctorId ?? "");
      const q = encodeURIComponent(doctorId.split(":")[1] ?? doctorId);
      navigate(`/doctors?tab=progress&q=${q}`);
      return;
    }
    case "open_vacancy": {
      // No deep-link route into a vacancy sheet yet — land on the list,
      // user clicks the row. Better than no-op.
      navigate(`/vacancies?focus=${encodeURIComponent(String(p.vacancyId ?? ""))}`);
      return;
    }
    case "open_run": {
      navigate(`/automations?run=${encodeURIComponent(String(p.runId ?? ""))}`);
      return;
    }
    case "update_lead_status": {
      const zohoId    = String(p.zohoId ?? "");
      const newStatus = String(p.newStatus ?? "");
      if (!zohoId || !newStatus) throw new Error("missing zohoId or newStatus");
      await zohoPut(`Leads/${zohoId}`, { data: [{ Lead_Status: newStatus }] });
      toast.success(`Lead status → ${newStatus}`);
      return;
    }
    case "reassign_run": {
      const runId   = String(p.runId ?? "");
      const toEmail = String(p.toEmail ?? "");
      if (!runId || !toEmail) throw new Error("missing runId or toEmail");
      const { error } = await supabase
        .from("automation_flow_runs")
        .update({ assigned_to: toEmail, reassigned_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw error;
      toast.success(`Reassigned to ${toEmail}`);
      return;
    }
    case "mark_shortlisted": {
      const runId = String(p.runId ?? "");
      if (!runId) throw new Error("missing runId");
      // Reuse the existing shortlist mutation surface — same wire format
      // SendProfileDialog uses. Inserts a stage event the scheduler picks up.
      const { error } = await supabase
        .from("automation_flow_events")
        .insert({ run_id: runId, kind: "shortlist_confirmed", payload: {} });
      if (error) throw error;
      toast.success("Marked shortlisted — the team will see the shortlist flow next tick.");
      return;
    }
    case "send_profile": {
      // The dialog is opened from the Automations page; deep-link with a
      // pre-fill query param so the page knows which doctor to focus on.
      const doctorId = encodeURIComponent(String(p.doctorId ?? ""));
      navigate(`/automations?flow=profile_sent&new=${doctorId}`);
      return;
    }
    case "link_to_vacancy": {
      const leadId    = String(p.leadId ?? "");
      const vacancyId = String(p.vacancyId ?? "");
      if (!leadId || !vacancyId) throw new Error("missing leadId or vacancyId");
      const { error } = await supabase
        .from("vacancy_lead_links")
        .insert({ vacancy_id: vacancyId, lead_id: leadId });
      if (error) throw error;
      toast.success("Lead linked to vacancy");
      return;
    }
    case "create_wp_profile": {
      const responseId = encodeURIComponent(String(p.responseId ?? ""));
      navigate(`/forms?createWp=${responseId}`);
      return;
    }
    case "mark_vacancy_status": {
      const vacancyId = String(p.vacancyId ?? "");
      const status    = String(p.status ?? "");
      if (!vacancyId || !["open", "filled", "closed"].includes(status)) {
        throw new Error("invalid vacancyId or status");
      }
      const { error } = await supabase
        .from("vacancies")
        .update({ status })
        .eq("id", vacancyId);
      if (error) throw error;
      toast.success(`Vacancy → ${status}`);
      return;
    }
    case "update_outreach": {
      const responseId = String(p.responseId ?? "");
      const status     = String(p.status ?? "");
      if (!responseId || !status) throw new Error("missing responseId or status");
      const { error } = await supabase
        .from("form_responses")
        .update({ outreach_status: status, outreach_updated_at: new Date().toISOString() })
        .eq("id", responseId);
      if (error) throw error;
      toast.success(`Outreach status → ${status}`);
      return;
    }
    default:
      throw new Error(`unknown action type: ${a.type}`);
  }
}

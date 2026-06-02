/**
 * Pick a vacancy to attach a sales lead to. Surfaces vacancies that match
 * the lead's specialty at the top, with all-open as a fallback.
 *
 * Used by:
 *   - Sales page row action (sales team flagging warm matches)
 *   - LeadsPipeline (when an HI team member wants to attach a lead)
 *   - DoctorVacancyMatches (one-click from the inline match suggestions)
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { ClipboardList, Search, Check, Sparkles, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useVacancies, useLinkLeadToVacancy } from "@/hooks/use-vacancies";
import { useAuth } from "@/hooks/use-auth";
import { groupSpecialty } from "@/lib/specialty-groups";
import { statusClasses } from "@/lib/status-colors";
import type { Vacancy } from "@/hooks/use-vacancies";

export interface LinkLeadInput {
  doctor_id:         string;       // zoho lead id
  doctor_name:       string;
  doctor_speciality: string | null;
}

interface Props {
  open:    boolean;
  onClose: () => void;
  lead:    LinkLeadInput | null;
}

export function LinkToVacancyDialog({ open, onClose, lead }: Props) {
  const { user } = useAuth();
  const { data: vacancies = [], isLoading } = useVacancies();
  const link = useLinkLeadToVacancy();
  const [search, setSearch] = useState("");

  const openVacancies = vacancies.filter(v => v.status === "open");

  // Rank: exact bucket match first, then specialty substring, then everything else.
  const ranked = useMemo(() => {
    const docBucket = lead?.doctor_speciality ? groupSpecialty(lead.doctor_speciality) : null;
    const q = search.trim().toLowerCase();
    return openVacancies
      .map(v => {
        const vBucket = groupSpecialty(v.specialty);
        const exactBucket = !!docBucket && vBucket === docBucket;
        const substring   = (lead?.doctor_speciality ?? "").toLowerCase().includes((v.specialty ?? "").toLowerCase())
                         || (v.specialty ?? "").toLowerCase().includes((lead?.doctor_speciality ?? "").toLowerCase());
        const score = exactBucket ? 100 : substring ? 50 : 0;
        return { v, score, exactBucket };
      })
      .filter(({ v }) => {
        if (!q) return true;
        return v.hospital_name.toLowerCase().includes(q) || (v.specialty ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => b.score - a.score || new Date(b.v.opened_at).getTime() - new Date(a.v.opened_at).getTime());
  }, [openVacancies, lead, search]);

  const handle = async (v: Vacancy) => {
    if (!lead) return;
    try {
      await link.mutateAsync({
        vacancy_id:        v.id,
        doctor_id:         lead.doctor_id,
        doctor_name:       lead.doctor_name,
        doctor_speciality: lead.doctor_speciality,
        linked_by:         user?.email ?? null,
      });
      toast.success(`Linked ${lead.doctor_name} to ${v.hospital_name} · ${v.specialty}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Link failed";
      if (/duplicate key|unique/i.test(msg)) {
        toast.info("Already linked to this vacancy.");
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-orange-600" />
            Link to a vacancy
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {lead
              ? <>Attach <strong>{lead.doctor_name}</strong>{lead.doctor_speciality && <> ({lead.doctor_speciality})</>} to one of the open vacancies below. The HI team sees them in the vacancy's candidate panel.</>
              : <>Pick a doctor first.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by hospital or specialty…"
            className="h-9 text-[12px] pl-8"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <CardListSkeleton rows={4} />
          ) : ranked.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No open vacancies"
              body={openVacancies.length === 0
                ? "There are no open vacancies right now. Ask the HI team to log one first."
                : "No vacancies match your filter. Clear it to see all open roles."}
              size="sm"
            />
          ) : (
            <div className="space-y-1.5">
              {ranked.map(({ v, score, exactBucket }) => (
                <button
                  key={v.id}
                  onClick={() => handle(v)}
                  disabled={link.isPending}
                  className="w-full text-left p-2.5 rounded-md border border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors flex items-center gap-3 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                      {v.hospital_name}
                      {exactBucket && (
                        <Badge variant="outline" className="text-[9px] bg-teal-100 text-teal-700 border-teal-300 flex items-center gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" /> Match
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${statusClasses(v.priority)}`}>
                        {v.priority}
                      </Badge>
                      {v.specialty}
                      {v.city && <> · {v.city}</>}
                    </div>
                  </div>
                  {score > 0 && <Check className={`h-3.5 w-3.5 shrink-0 ${exactBucket ? "text-teal-600" : "text-slate-300"}`} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={link.isPending}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

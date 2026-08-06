/**
 * Reassign-run dropdown. Dropdown shows the HI roster + "Unassigned"
 * and fires useReassignRun, which both updates the run row and logs a
 * note event for the timeline.
 *
 * The last item escalates to the BULK path (HandoffDialog) for when a whole
 * queue needs to move — leave cover, escalation, permanent transfer. The
 * single-run behaviour above it is deliberately untouched so the quick path
 * stays quick.
 *
 * Used by:
 *   - RunDetailSheet header (per-run reassignment)
 */
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useReassignRun } from "@/hooks/use-automation-flows";
import { HI_TEAM_MEMBERS, findHiMemberByEmail } from "@/lib/hi-team";
import { HandoffDialog } from "@/components/automations/HandoffDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UserCog, Check, UserX, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

interface ReassignButtonProps {
  runId:           string;
  currentAssignee: string | null;
  size?:           "sm" | "default";
}

export function ReassignButton({ runId, currentAssignee, size = "sm" }: ReassignButtonProps) {
  const { user } = useAuth();
  const reassign = useReassignRun();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const currentName = currentAssignee
    ? findHiMemberByEmail(currentAssignee)?.name ?? currentAssignee.split("@")[0]
    : null;
  // Whose queue the bulk dialog opens on: this run's owner if it has one,
  // otherwise the signed-in user (so "hand off my work" still makes sense
  // from an unassigned run).
  const handoffFrom = currentAssignee ?? user?.email ?? null;

  const handle = async (toEmail: string | null) => {
    const currentLower = (currentAssignee ?? "").toLowerCase();
    const targetLower  = (toEmail ?? "").toLowerCase();
    if (currentLower === targetLower) return;
    try {
      await reassign.mutateAsync({
        run_id:             runId,
        to_email:           toEmail,
        current_user_email: user?.email ?? null,
      });
      toast.success(toEmail
        ? `Reassigned to ${findHiMemberByEmail(toEmail)?.name ?? toEmail}`
        : "Unassigned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reassign failed");
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant="outline" className="h-7 text-[11px] gap-1.5" disabled={reassign.isPending}>
          <UserCog className="h-3 w-3" />
          {currentName ?? "Assign"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Hospital Introduction team
        </DropdownMenuLabel>
        {HI_TEAM_MEMBERS.map(m => {
          const isCurrent = (currentAssignee ?? "").toLowerCase() === m.email.toLowerCase();
          return (
            <DropdownMenuItem
              key={m.email}
              onClick={() => handle(m.email)}
              className="text-[12px] flex items-center justify-between"
            >
              <span>{m.name}</span>
              {isCurrent && <Check className="h-3 w-3 text-teal-600" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handle(null)}
          className="text-[12px] text-rose-600 flex items-center gap-2"
        >
          <UserX className="h-3 w-3" /> Unassigned
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Escalation to the bulk path — moves a whole queue, with a reason,
            a duration and an audit trail. */}
        <DropdownMenuItem
          onClick={() => setHandoffOpen(true)}
          className="text-[12px] text-teal-700 font-medium flex items-center gap-2"
        >
          <ArrowLeftRight className="h-3 w-3" />
          {currentName ? `Hand off all of ${currentName.split(" ")[0]}'s work…` : "Hand off work…"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <HandoffDialog
      open={handoffOpen}
      onClose={() => setHandoffOpen(false)}
      initialFrom={handoffFrom}
    />
    </>
  );
}

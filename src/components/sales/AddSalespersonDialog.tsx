import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDashboardUsers, useAddSalesBoardMember } from "@/hooks/use-sales-board";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Admin-only picker: add a dashboard user to the Sales Tracker board. */
export function AddSalespersonDialog({ open, onClose, existingNames, addedBy }: {
  open: boolean;
  onClose: () => void;
  /** Normalised names already on the board (recruiters + pinned). */
  existingNames: Set<string>;
  addedBy?: string | null;
}) {
  const { data: users = [], isLoading } = useDashboardUsers(open);
  const add = useAddSalesBoardMember();
  const [q, setQ] = useState("");

  const candidates = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users
      .filter(u => (u.full_name || u.email))
      .filter(u => u.role !== "worker")                                  // workers have their own portal
      .filter(u => !existingNames.has(norm(u.full_name || u.email)))     // not already on the board
      .filter(u => !term
        || (u.full_name || "").toLowerCase().includes(term)
        || (u.email || "").toLowerCase().includes(term))
      .slice(0, 50);
  }, [users, q, existingNames]);

  async function handleAdd(u: { id: string; full_name: string | null; email: string | null }) {
    const name = (u.full_name || u.email || "").trim();
    if (!name) return;
    try {
      await add.mutateAsync({ member_name: name, email: u.email, user_id: u.id, added_by: addedBy ?? null });
      toast.success(`${name} added to the sales board`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add — the sales board table may not be set up yet.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Add a salesperson
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search dashboard users…" value={q} onChange={e => setQ(e.target.value)} className="pl-8 h-9 text-[12px]" />
        </div>
        <div className="max-h-[320px] overflow-y-auto -mx-1 mt-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading users…
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-8">No users to add.</p>
          ) : candidates.map(u => (
            <button
              key={u.id}
              onClick={() => handleAdd(u)}
              disabled={add.isPending}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium truncate">{u.full_name || u.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.full_name ? u.email : ""}{u.role ? ` · ${u.role}` : ""}</p>
              </div>
              <span className="text-[11px] text-primary font-medium shrink-0 inline-flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Add
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

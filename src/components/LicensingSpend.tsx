/**
 * LicensingSpend — per-doctor licensing-cost ledger, shown inside the Doctors →
 * Overview detail. Tracks money spent licensing a doctor out of their first
 * invoice (UK->UAE conversion, DataFlow, etc.) since Zoho has no field for it.
 * Add line items (what it was for, amount in AED, date) with an optional
 * receipt file; edit or delete any of them. Amounts display through the
 * dashboard's AED/USD toggle.
 */
import { useState } from "react";
import {
  useLicensingCosts, useUpsertLicensingCost, useDeleteLicensingCost,
  uploadLicensingReceipt, getReceiptUrl, type LicensingCost,
} from "@/hooks/use-licensing-costs";
import { useCurrency } from "@/lib/CurrencyProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Banknote, Plus, Trash2, Paperclip,
  Loader2, ExternalLink, Pencil, Check, X,
} from "lucide-react";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  return isNaN(t.getTime()) ? "" : t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function LicensingSpend({ doctorId, doctorName }: { doctorId: string; doctorName: string | null }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data: items = [], isLoading } = useLicensingCosts(doctorId);
  const { fmt } = useCurrency();
  const del = useDeleteLicensingCost();

  const total = items.reduce((s, i) => s + Number(i.amount_aed || 0), 0);

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
        <Banknote className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-[12.5px] font-medium text-slate-800">Licensing spend</span>
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        <span className="ml-auto text-[11px] font-semibold text-slate-700">
          {items.length > 0 ? fmt(total) : <span className="font-normal text-muted-foreground">None</span>}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-0.5 border-t border-slate-100 space-y-2">
          {items.length > 0 && (
            <div className="divide-y divide-slate-100">
              {items.map(item => (
                editingId === item.id
                  ? <EntryForm key={item.id} doctorId={doctorId} doctorName={doctorName} item={item} onDone={() => setEditingId(null)} />
                  : <Row key={item.id} item={item} fmt={fmt}
                      onEdit={() => setEditingId(item.id)}
                      onDelete={async () => {
                        if (!confirm(`Delete "${item.description}" (${fmt(Number(item.amount_aed))})?`)) return;
                        try { await del.mutateAsync({ id: item.id, doctorId, receiptPath: item.receipt_path }); toast.success("Deleted."); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete."); }
                      }} />
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex items-center justify-between pt-1 text-[12px]">
              <span className="text-muted-foreground">Total licensing spend</span>
              <span className="font-semibold text-slate-800">{fmt(total)}</span>
            </div>
          )}

          {adding
            ? <EntryForm doctorId={doctorId} doctorName={doctorName} onDone={() => setAdding(false)} />
            : <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add licensing cost
              </Button>}
        </div>
      )}
    </div>
  );
}

function Row({ item, fmt, onEdit, onDelete }: {
  item: LicensingCost; fmt: (v: number) => string; onEdit: () => void; onDelete: () => void;
}) {
  const openReceipt = async () => {
    if (!item.receipt_path) return;
    const url = await getReceiptUrl(item.receipt_path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Couldn't open the receipt.");
  };
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-slate-800">{item.description}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground mt-0.5">
          {item.spent_on && <span>{fmtDate(item.spent_on)}</span>}
          {item.receipt_path && (
            <button type="button" onClick={openReceipt} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
              <Paperclip className="h-3 w-3" /> {item.receipt_name || "Receipt"} <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
          {item.notes && <span className="italic">{item.notes}</span>}
        </div>
      </div>
      <div className="text-[12.5px] font-semibold text-slate-800 whitespace-nowrap">{fmt(Number(item.amount_aed))}</div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onEdit} title="Edit" className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <Pencil className="h-3 w-3" />
        </button>
        <button type="button" onClick={onDelete} title="Delete" className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function EntryForm({ doctorId, doctorName, item, onDone }: {
  doctorId: string; doctorName: string | null; item?: LicensingCost; onDone: () => void;
}) {
  const upsert = useUpsertLicensingCost();
  const [desc, setDesc] = useState(item?.description ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount_aed) : "");
  const [date, setDate] = useState(item?.spent_on ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount);
    if (!desc.trim()) { toast.error("Add a description (what the cost was for)."); return; }
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Enter a valid amount."); return; }
    setBusy(true);
    try {
      let receipt_path = item?.receipt_path ?? null;
      let receipt_name = item?.receipt_name ?? null;
      if (file) {
        const up = await uploadLicensingReceipt(doctorId, file);
        receipt_path = up.path; receipt_name = up.name;
      }
      await upsert.mutateAsync({
        id: item?.id,
        doctor_id: doctorId,
        doctor_name: doctorName,
        description: desc.trim(),
        amount_aed: amt,
        spent_on: date || null,
        notes: notes.trim() || null,
        receipt_path, receipt_name,
      });
      toast.success(item ? "Updated." : "Added.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-teal-200 bg-teal-50/40 p-2.5 my-1 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <label className="block">
          <span className="text-[9.5px] uppercase tracking-wider text-slate-500">What it was for</span>
          <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. UK→UAE license conversion (DataFlow)" className="mt-0.5 h-8 text-[12px] bg-white" />
        </label>
        <label className="block">
          <span className="text-[9.5px] uppercase tracking-wider text-slate-500">Amount (AED)</span>
          <Input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="mt-0.5 h-8 text-[12px] bg-white w-32" />
        </label>
        <label className="block">
          <span className="text-[9.5px] uppercase tracking-wider text-slate-500">Date</span>
          <Input value={date} onChange={e => setDate(e.target.value)} type="date" className="mt-0.5 h-8 text-[12px] bg-white" />
        </label>
      </div>
      <label className="block">
        <span className="text-[9.5px] uppercase tracking-wider text-slate-500">Note (optional)</span>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth recording" className="mt-0.5 h-8 text-[12px] bg-white" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50">
          <Paperclip className="h-3 w-3" />
          {file ? file.name : (item?.receipt_name ? `Replace receipt (${item.receipt_name})` : "Attach receipt")}
          <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="h-7 text-[12px]" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            {item ? "Save" : "Add"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onDone} disabled={busy}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

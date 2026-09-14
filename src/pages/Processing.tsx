import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ProcessingPanel } from "./ProcessingPanel";

/**
 * Processing — the doctor stage tracker. The search bar mirrors /sends: the
 * query lives in `?q=` so links stay shareable, and the active stage filter
 * lives in `?stage=` (read by ProcessingPanel straight off the URL).
 */
export default function Processing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const setQ = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("q", v); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search — doctor, hospital, specialty…"
          className="pl-10 pr-24 h-10 text-[13px]"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>

      <ProcessingPanel query={q} />
    </DashboardLayout>
  );
}

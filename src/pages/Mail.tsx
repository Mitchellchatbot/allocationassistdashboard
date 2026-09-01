import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { MailPanel } from "./MailView";

/**
 * Mail — a top-level sidebar page (team feedback #14) giving the outbound email
 * workflow a Gmail-style, three-pane home: folders (Inbox / Sent / Scheduled),
 * a message list, and a reading pane. It doesn't re-implement the composers;
 * its Compose button opens a send-type chooser that routes into the existing
 * Sends tabs, and each reading pane deep-links back to the matching tab.
 *
 * The search box mirrors the /doctors + /sends pattern — the query lives in
 * `?q=` and filters whichever folder is open.
 */
export default function Mail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const setQ = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("q", v); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search mail — doctor, hospital, sender, subject, message text…"
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

      <MailPanel query={q} />
    </DashboardLayout>
  );
}

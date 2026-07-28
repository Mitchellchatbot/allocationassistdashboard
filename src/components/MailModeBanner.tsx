import { TestTube, AlertTriangle } from "lucide-react";
import { useMailTestMode } from "@/hooks/use-mail-test-mode";

/**
 * "Test inbox" (green) vs "LIVE" (red) banner for send previews, so every send
 * surface shows where the mail actually lands. Mirrors the banner the batch +
 * bulk previews render inline. `liveCount`/`liveWhat` describe the real send.
 */
export function MailModeBanner({ liveCount, liveWhat = "recipient" }: { liveCount?: number; liveWhat?: string }) {
  const { data } = useMailTestMode();
  if (!data) return null;
  const n = liveCount ?? 0;
  return data.test_mode ? (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-[11px] text-emerald-900 shadow-sm">
      <span className="inline-flex items-start gap-1.5"><TestTube className="h-3.5 w-3.5 mt-[1px] shrink-0" /><span><strong>Test mode is ON.</strong> This send goes to the test inbox (<strong>{data.test_recipient ?? "test recipient"}</strong>), <strong>not</strong> the real {liveWhat}. Nothing reaches a real inbox.</span></span>
    </div>
  ) : (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[11px] text-rose-900 shadow-sm">
      <span className="inline-flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-[1px] shrink-0" /><span><strong>LIVE mode.</strong> This goes to {n ? <><strong>{n}</strong> real {liveWhat}{n === 1 ? "" : "s"}</> : <>the real {liveWhat}</>}. There is no undo.</span></span>
    </div>
  );
}

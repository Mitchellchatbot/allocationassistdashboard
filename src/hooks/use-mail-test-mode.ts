import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Whether outgoing mail is being redirected to the test inbox
 * (MAIL_TEST_RECIPIENT_OVERRIDE). Lets the profile/flow send previews show the
 * same green "test inbox" / red "LIVE" banner the batch + bulk previews already
 * have, so no send surface hides where the mail actually lands. Cheap status
 * probe on send-flow-email; cached for the session.
 */
export interface MailTestMode { test_mode: boolean; test_recipient: string | null }

export function useMailTestMode() {
  return useQuery<MailTestMode>({
    queryKey: ["mail-test-mode"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke("send-flow-email", { body: { action: "test_status" } });
        if (error) throw error;
        const r = data as { test_mode?: boolean; test_recipient?: string | null };
        return { test_mode: !!r?.test_mode, test_recipient: r?.test_recipient ?? null };
      } catch {
        // Unknown → assume LIVE (fail safe: warn rather than falsely reassure).
        return { test_mode: false, test_recipient: null };
      }
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

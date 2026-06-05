/**
 * Pings the Slack webhook with a "you're wired up" message so a user
 * in Settings can confirm SLACK_WEBHOOK_URL is set correctly without
 * waiting for a real notification to fire.
 *
 * Returns:
 *   - ok=true if Slack returned 200.
 *   - ok=false + reason if the webhook is missing OR Slack errored.
 */
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const url = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!url) {
    return new Response(JSON.stringify({ ok: false, reason: "SLACK_WEBHOOK_URL not set on the edge function. Run `npx supabase secrets set SLACK_WEBHOOK_URL=…` and redeploy." }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      attachments: [{
        color: "#16a34a",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: ":white_check_mark: *Slack notifications wired up*" } },
          { type: "section", text: { type: "mrkdwn", text: "AllocationAssist will post here for *Needs action* and *Critical* notifications. Routine info stays in-dashboard." } },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Response(JSON.stringify({ ok: false, reason: `Slack returned ${res.status}: ${text.slice(0, 200)}` }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

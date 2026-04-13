/**
 * ai-insights — Supabase Edge Function
 *
 * Accepts a POST with a JSON body containing a summary of dashboard stats.
 * Calls Claude Opus 4.6 via the Anthropic SDK and streams the response back
 * as plain text (chunked transfer encoding) so the browser can display it
 * progressively.
 *
 * Secrets required:
 *   ANTHROPIC_API_KEY
 */

import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  let stats: Record<string, unknown> = {};
  try {
    stats = await req.json();
  } catch {
    // stats stays empty — Claude will give general advice
  }

  const contextBlock = JSON.stringify(stats, null, 2);

  const systemPrompt = `You are an AI assistant for AllocationAssist, a doctor recruitment and placement company that helps international doctors (mainly from Europe, Asia, and Africa) find positions in UAE hospitals.

You analyse live CRM data from Zoho and surface the most actionable insights for the recruitment team. Be direct, specific, and concise. Use plain text — no markdown headers, no bullet symbols, just short numbered points. Each insight should be one or two sentences maximum.`;

  const userPrompt = `Here is the current dashboard snapshot:

${contextBlock}

Give me exactly 5 insights the recruitment team should act on today. Focus on: where leads are getting stuck, which channels are producing the most doctors, high-priority follow-ups, recruiter workload balance, and any anomalies in the pipeline. Number each insight 1–5.`;

  // Create a ReadableStream that pipes Claude's streaming output to the browser
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          thinking: { type: 'adaptive' },
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n[Error: ${String(err)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

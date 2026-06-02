/**
 * sheets-ingest — Supabase Edge Function
 *
 * Receives raw 2D arrays of cells from n8n (which fetches them from the
 * Digital Marketing Google Sheet) and upserts parsed expense rows into
 * marketing_expenses.
 *
 * n8n sends one POST per tab:
 *   POST /functions/v1/sheets-ingest
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *   { "tab": "account_transactions" | "marketing_2025" | "marketing_2026",
 *     "rows": [[cell,cell,...], ...],
 *     "dry_run": false }
 *
 * Idempotency comes from the existing unique index on
 *   (expense_date, category, amount, COALESCE(description, ''))
 * defined in supabase/marketing_expenses.sql — re-ingesting the same
 * sheet is safe.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Tab = 'account_transactions' | 'marketing_2025' | 'marketing_2026';

interface ParsedRow {
  expense_date: string;   // YYYY-MM-DD
  category:     string;
  description:  string;   // '' (never null) so the plain-column unique index matches
  amount:       number;
  currency:     string;
}

// ─── Channel block layouts for the wide-format "Marketing Data" tabs ────────
// Column indices are 0-based. If the sheet layout changes, edit here.

const LAYOUT_2025 = [
  { channel: 'Google',    date: 0,  desc: 2,  amount: 3  },
  { channel: 'Meta',      date: 5,  desc: 6,  amount: 7  },
  { channel: 'LinkedIn',  date: 9,  desc: 10, amount: 11 },
  { channel: 'GoHire',    date: 13, desc: 14, amount: 15 },
  { channel: 'SEO',       date: 17, desc: 18, amount: 19 },
  { channel: 'Zapier',    date: 21, desc: 22, amount: 23 },
  { channel: 'PromoCloud', date: 25, desc: 26, amount: 27 }, // sheet calls it "Magna /Cost" but values are PROMOCLUB
  { channel: 'DILO',      date: 29, desc: 30, amount: 31 },
  { channel: 'Fanbasis',  date: 33, desc: 34, amount: 35 },
  { channel: 'Semrush',   date: 37, desc: 38, amount: 39 },
  { channel: 'Yoast',     date: 41, desc: 42, amount: 43 },
  { channel: 'Pabbly',    date: 45, desc: 46, amount: 47 },
  { channel: 'Jobsoid',   date: 49, desc: 50, amount: 51 },
  { channel: 'Canva',     date: 53, desc: 54, amount: 55 },
] as const;

const LAYOUT_2026 = [
  { channel: 'Meta',      date: 1,  desc: 2,  amount: 3  },
  { channel: 'LinkedIn',  date: 5,  desc: 6,  amount: 7  },
  { channel: 'GoHire',    date: 9,  desc: 10, amount: 11 },
  { channel: 'SEO',       date: 13, desc: 14, amount: 15 },
  { channel: 'Zapier',    date: 18, desc: 19, amount: 20 }, // 5-col gap after SEO in 2026
  { channel: 'PromoCloud', date: 22, desc: 23, amount: 24 },
  { channel: 'DILO',      date: 26, desc: 27, amount: 28 },
  { channel: 'Pabbly',    date: 30, desc: 31, amount: 32 },
  { channel: 'Jobsoid',   date: 34, desc: 35, amount: 36 },
  { channel: 'Canva',     date: 38, desc: 39, amount: 40 },
  { channel: 'CapCut',    date: 42, desc: 43, amount: 44 },
  { channel: 'ClaudeAI',  date: 46, desc: 47, amount: 48 },
  { channel: 'Frame.io',  date: 50, desc: 51, amount: 52 },
  { channel: 'Hootsuite', date: 54, desc: 55, amount: 56 },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

// Zoho's Supplier column uses inconsistent casing. Map to canonical names
// so the dashboard groups Facebook+Meta+meta together.
const CATEGORY_ALIASES: Record<string, string> = {
  facebook: 'Meta',
  meta:     'Meta',
  google:   'Google',
  linkedin: 'LinkedIn',
  gohire:   'GoHire',
  jobsoid:  'Jobsoid',
  jobscan:  'Jobscan',
  promocloud: 'PromoCloud',
  'jobrapido srl': 'Jobrapido',
};
function normalizeCategory(raw: string): string {
  const k = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[k] ?? raw.trim();
}

// Accepts: "2025-01-03", "16 Oct 2025", "01 Oct 2025"
function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // "DD MMM YYYY" → "YYYY-MM-DD"
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Strips commas, whitespace, currency symbols. "  3,073.59 " → 3073.59
function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[,\s$£€]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "January Google Expense", "TOTAL EXPENSE FOR YEAR 2025", "September Meta Expense"
// — these are subtotal rows the sheet mixes in. Skip them.
function isSubtotalDescription(s: string): boolean {
  return /\b(expense|total)\b/i.test(s) && !/visa purchase|facebk|google\*ads|linkedin/i.test(s);
}

// ─── Parser: account_transactions tab ───────────────────────────────────────

function parseAccountTransactions(rows: unknown[][]): { parsed: ParsedRow[]; skipped: number } {
  // First 2 rows are the title block ("ALLOCATION ASSIST DMCC...") and column
  // headers. Find the header row dynamically so a re-export with different
  // preamble doesn't break us.
  let headerIdx = rows.findIndex(r =>
    Array.isArray(r) && r.some(c => typeof c === 'string' && c.trim() === 'transaction_id'),
  );
  if (headerIdx < 0) return { parsed: [], skipped: rows.length };

  const header = (rows[headerIdx] as string[]).map(h => String(h).trim());
  const col = (name: string) => header.indexOf(name);

  const cDate     = col('date');
  const cDetails  = col('transaction_details');
  const cOffType  = col('offset_account_type');
  const cTxType   = col('transaction_type');
  const cDebit    = col('debit');
  const cDesc     = col('description');
  const cCurrency = col('currency_code');
  const cSupplier = col('Supplier');

  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length === 0) { skipped++; continue; }

    const txType = String(r[cTxType] ?? '').trim().toLowerCase();
    if (txType !== 'expense') { skipped++; continue; }              // skip bills (cash basis)

    const offType = String(r[cOffType] ?? '').trim().toLowerCase();
    if (offType === 'other_current_asset') { skipped++; continue; } // skip prepayment accruals

    const details = String(r[cDetails] ?? '');
    if (/^prepaid/i.test(details.trim())) { skipped++; continue; }  // belt-and-suspenders

    const supplier = String(r[cSupplier] ?? '').trim();
    if (!supplier) { skipped++; continue; }                         // unattributed row

    const date   = parseDate(r[cDate]);
    const amount = parseAmount(r[cDebit]);
    if (!date || !amount) { skipped++; continue; }

    parsed.push({
      expense_date: date,
      category:     normalizeCategory(supplier),
      description:  String(r[cDesc] ?? '').trim() || details.trim() || '',
      amount,
      currency:     String(r[cCurrency] ?? 'AED').trim() || 'AED',
    });
  }

  return { parsed, skipped };
}

// ─── Parser: wide-format Marketing Data tabs ────────────────────────────────

function parseWideTab(
  rows: unknown[][],
  layout: ReadonlyArray<{ channel: string; date: number; desc: number; amount: number }>,
): { parsed: ParsedRow[]; skipped: number } {
  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (!Array.isArray(r)) { skipped++; continue; }

    for (const block of layout) {
      const date   = parseDate(r[block.date]);
      const amount = parseAmount(r[block.amount]);
      if (!date || !amount) continue;

      const desc = String(r[block.desc] ?? '').trim();
      if (isSubtotalDescription(desc)) continue;     // skip "January Google Expense" etc.

      parsed.push({
        expense_date: date,
        category:     normalizeCategory(block.channel),
        description:  desc,
        amount,
        currency:     'AED',
      });
    }
  }

  return { parsed, skipped };
}

// ─── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const tab: Tab | undefined = body.tab;
    const rows: unknown[][] | undefined = body.rows;
    const dryRun: boolean = body.dry_run === true;

    if (!tab || !Array.isArray(rows)) {
      return new Response(JSON.stringify({
        error: 'body must include {tab, rows[]}',
        got: { tab, rowsType: Array.isArray(rows) ? `array(${rows.length})` : typeof rows },
      }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    let result: { parsed: ParsedRow[]; skipped: number };
    if (tab === 'account_transactions') {
      result = parseAccountTransactions(rows);
    } else if (tab === 'marketing_2025') {
      result = parseWideTab(rows, LAYOUT_2025);
    } else if (tab === 'marketing_2026') {
      result = parseWideTab(rows, LAYOUT_2026);
    } else {
      return new Response(JSON.stringify({ error: `unknown tab: ${tab}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true, tab,
        parsed_count: result.parsed.length,
        skipped: result.skipped,
        sample: result.parsed.slice(0, 5),
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Upsert in chunks of 500 to stay under PostgREST body limits.
    let inserted = 0;
    for (let i = 0; i < result.parsed.length; i += 500) {
      const chunk = result.parsed.slice(i, i + 500);
      const { error, count } = await supabase
        .from('marketing_expenses')
        .upsert(chunk, {
          onConflict: 'expense_date,category,amount,description',
          ignoreDuplicates: false,
          count: 'exact',
        });
      if (error) throw error;
      inserted += count ?? chunk.length;
    }

    return new Response(JSON.stringify({
      ok: true, tab,
      parsed_count: result.parsed.length,
      upserted: inserted,
      skipped: result.skipped,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[sheets-ingest]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

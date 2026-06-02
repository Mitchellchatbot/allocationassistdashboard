/**
 * One-time backfill: parse 3 CSV tabs from the Digital Marketing sheet and
 * emit a single CSV ready for Supabase Studio's "Import data from CSV" button.
 *
 * Usage:
 *   1. Download the 3 tabs from your Google Sheet / Excel:
 *        File → Download → Comma Separated Values (.csv)
 *      Save them into ./data/ as:
 *        data/account_transactions.csv
 *        data/marketing_2025.csv
 *        data/marketing_2026.csv
 *   2. Run:
 *        bun run scripts/backfill-marketing-expenses.ts
 *   3. Upload the resulting marketing_expenses_backfill.csv via
 *      Supabase Studio → marketing_expenses table → Insert → Import from CSV.
 *      Tick "Upsert" if Studio offers it; otherwise delete existing rows
 *      first (the unique index will reject true duplicates anyway).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── CSV parsing (quote-aware) ───────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else { cell += c; }
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ─── Shared types + helpers (mirror of sheets-ingest function) ───────────────

interface ParsedRow {
  expense_date: string;
  category:     string;
  description:  string;
  amount:       number;
  currency:     string;
}

const CATEGORY_ALIASES: Record<string, string> = {
  facebook: 'Meta', meta: 'Meta', google: 'Google', linkedin: 'LinkedIn',
  gohire: 'GoHire', jobsoid: 'Jobsoid', jobscan: 'Jobscan',
  promocloud: 'PromoCloud', 'jobrapido srl': 'Jobrapido',
};
const normalizeCategory = (raw: string) =>
  CATEGORY_ALIASES[raw.trim().toLowerCase()] ?? raw.trim();

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
      jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
    };
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[,\s$£€]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const isSubtotalDescription = (s: string) =>
  /\b(expense|total)\b/i.test(s) && !/visa purchase|facebk|google\*ads|linkedin/i.test(s);

// ─── Parsers (identical logic to supabase/functions/sheets-ingest) ───────────

function parseAccountTransactions(rows: string[][]): ParsedRow[] {
  const headerIdx = rows.findIndex(r => r.some(c => c.trim() === 'transaction_id'));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map(h => h.trim());
  const col = (name: string) => header.indexOf(name);

  const cDate     = col('date');
  const cDetails  = col('transaction_details');
  const cOffType  = col('offset_account_type');
  const cTxType   = col('transaction_type');
  const cDebit    = col('debit');
  const cDesc     = col('description');
  const cCurrency = col('currency_code');
  const cSupplier = col('Supplier');

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    if ((r[cTxType] ?? '').trim().toLowerCase() !== 'expense') continue;
    if ((r[cOffType] ?? '').trim().toLowerCase() === 'other_current_asset') continue;
    const details = r[cDetails] ?? '';
    if (/^prepaid/i.test(details.trim())) continue;
    const supplier = (r[cSupplier] ?? '').trim();
    if (!supplier) continue;
    const date   = parseDate(r[cDate]);
    const amount = parseAmount(r[cDebit]);
    if (!date || !amount) continue;
    out.push({
      expense_date: date,
      category:     normalizeCategory(supplier),
      description:  (r[cDesc] ?? '').trim() || details.trim() || '',
      amount,
      currency:     (r[cCurrency] ?? 'AED').trim() || 'AED',
    });
  }
  return out;
}

const LAYOUT_2025 = [
  { channel: 'Google',     date: 0,  desc: 2,  amount: 3  },
  { channel: 'Meta',       date: 5,  desc: 6,  amount: 7  },
  { channel: 'LinkedIn',   date: 9,  desc: 10, amount: 11 },
  { channel: 'GoHire',     date: 13, desc: 14, amount: 15 },
  { channel: 'SEO',        date: 17, desc: 18, amount: 19 },
  { channel: 'Zapier',     date: 21, desc: 22, amount: 23 },
  { channel: 'PromoCloud', date: 25, desc: 26, amount: 27 },
  { channel: 'DILO',       date: 29, desc: 30, amount: 31 },
  { channel: 'Fanbasis',   date: 33, desc: 34, amount: 35 },
  { channel: 'Semrush',    date: 37, desc: 38, amount: 39 },
  { channel: 'Yoast',      date: 41, desc: 42, amount: 43 },
  { channel: 'Pabbly',     date: 45, desc: 46, amount: 47 },
  { channel: 'Jobsoid',    date: 49, desc: 50, amount: 51 },
  { channel: 'Canva',      date: 53, desc: 54, amount: 55 },
] as const;

const LAYOUT_2026 = [
  { channel: 'Meta',       date: 1,  desc: 2,  amount: 3  },
  { channel: 'LinkedIn',   date: 5,  desc: 6,  amount: 7  },
  { channel: 'GoHire',     date: 9,  desc: 10, amount: 11 },
  { channel: 'SEO',        date: 13, desc: 14, amount: 15 },
  { channel: 'Zapier',     date: 18, desc: 19, amount: 20 },
  { channel: 'PromoCloud', date: 22, desc: 23, amount: 24 },
  { channel: 'DILO',       date: 26, desc: 27, amount: 28 },
  { channel: 'Pabbly',     date: 30, desc: 31, amount: 32 },
  { channel: 'Jobsoid',    date: 34, desc: 35, amount: 36 },
  { channel: 'Canva',      date: 38, desc: 39, amount: 40 },
  { channel: 'CapCut',     date: 42, desc: 43, amount: 44 },
  { channel: 'ClaudeAI',   date: 46, desc: 47, amount: 48 },
  { channel: 'Frame.io',   date: 50, desc: 51, amount: 52 },
  { channel: 'Hootsuite',  date: 54, desc: 55, amount: 56 },
] as const;

function parseWideTab(
  rows: string[][],
  layout: ReadonlyArray<{ channel: string; date: number; desc: number; amount: number }>,
): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const r of rows) {
    for (const b of layout) {
      const date   = parseDate(r[b.date]);
      const amount = parseAmount(r[b.amount]);
      if (!date || !amount) continue;
      const desc = (r[b.desc] ?? '').trim();
      if (isSubtotalDescription(desc)) continue;
      out.push({
        expense_date: date,
        category:     normalizeCategory(b.channel),
        description:  desc,
        amount,
        currency:     'AED',
      });
    }
  }
  return out;
}

// ─── Output ──────────────────────────────────────────────────────────────────

function toCsv(rows: ParsedRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'expense_date,category,description,amount,currency';
  const body = rows.map(r =>
    [r.expense_date, r.category, r.description, r.amount, r.currency].map(esc).join(','),
  ).join('\n');
  return header + '\n' + body + '\n';
}

// ─── Dedupe (in case the same row appears across tabs) ───────────────────────

function dedupe(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>();
  const out: ParsedRow[] = [];
  for (const r of rows) {
    const k = `${r.expense_date}|${r.category}|${r.amount}|${r.description}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const DATA_DIR = join(import.meta.dir ?? process.cwd(), '..', 'data');

const inputs = [
  { tab: 'account_transactions', file: 'account_transactions.csv',
    parser: (rows: string[][]) => parseAccountTransactions(rows) },
  { tab: 'marketing_2025',       file: 'marketing_2025.csv',
    parser: (rows: string[][]) => parseWideTab(rows, LAYOUT_2025) },
  { tab: 'marketing_2026',       file: 'marketing_2026.csv',
    parser: (rows: string[][]) => parseWideTab(rows, LAYOUT_2026) },
];

const all: ParsedRow[] = [];
for (const { tab, file, parser } of inputs) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) {
    console.warn(`⚠  ${file} not found at ${path} — skipping`);
    continue;
  }
  const text = readFileSync(path, 'utf8');
  const parsed = parser(parseCsv(text));
  console.log(`✓ ${tab.padEnd(22)} → ${parsed.length} rows`);
  all.push(...parsed);
}

const deduped = dedupe(all);
const dropped = all.length - deduped.length;
console.log(`\nTotal: ${all.length} parsed, ${dropped} cross-tab duplicates dropped, ${deduped.length} to upload\n`);

const outPath = join(process.cwd(), 'marketing_expenses_backfill.csv');
writeFileSync(outPath, toCsv(deduped));
console.log(`→ Wrote ${outPath}`);
console.log(`  Upload via Supabase Studio: Table editor → marketing_expenses → Insert → Import from CSV`);

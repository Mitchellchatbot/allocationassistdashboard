/**
 * ExpenseSearch — a supercharged universal search over every expense in Zoho
 * Books for the selected period. It reads the same general-ledger feed the
 * Sankey drill-downs use (action=accounttxns) — every bill / expense / journal
 * leg — and matches it client-side with:
 *   • a brand/synonym alias map grounded in the real vendors + accounts, so
 *     "facebook" finds Meta, "payroll" finds Salaries, "telecom" finds Etisalat;
 *   • typo tolerance (bounded Damerau-Levenshtein) so "fcebook" still hits;
 *   • relevance ranking (exact > prefix > word > alias > substring > fuzzy).
 * A per-row index is precomputed once per period, so every keystroke is sub-ms
 * over ~1700 rows. The ledger fetch is lazy + cached (shared with the Sankey).
 */
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useZohoAccountTxns } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import { groupFor } from "@/lib/finance-groups";
import { Search, Loader2 } from "lucide-react";
import gsap from "gsap";

interface Row { date: string; category: string; type: string; text: string; amount: number }

const CAP = 250; // max rows rendered; results are ranked before this slice

// ── Brand / concept alias dictionary ───────────────────────────────────────
// Grounded in the real vendors + accounts in this org's ledger. Each concept
// maps to every word/phrase a user might type AND the real strings in the data,
// so a query term expands to the concept and matches rows tagged with it.
const ALIAS_MAP: Record<string, string[]> = {
  meta: ["meta", "facebook", "fb", "fb.me", "facebk", "insta", "instagram", "ig", "fbads", "facebook ads", "meta platforms", "meta platforms ireland limited"],
  google: ["google", "gcp", "gcloud", "g cloud", "google cloud", "adwords", "google ads", "gsuite", "google workspace", "google cloud emea limited"],
  linkedin: ["linkedin", "linked in", "li", "li ads", "linkedin ireland", "linkedin ireland unliited company", "linkedin ireland unlimited company", "unliited"],
  adobe: ["adobe", "acrobat", "photoshop", "creative cloud", "creativecloud", "adobe systems", "adobe systems software ireland ltd"],
  anthropic: ["anthropic", "claude", "claude ai", "anthropic pbc"],
  scaledai: ["scaled ai", "scaledai", "scaled", "scaled ai llc"],
  ai_llm: ["ai", "llm", "gpt", "chatgpt", "openai", "genai", "artificial intelligence"],
  etisalat: ["etisalat", "eand", "telco", "emirates telecom", "emirates telecommunications", "emirates telecommunications group company", "etisalat group"],
  dewa: ["dewa", "dubai electricity", "dubai water", "dubai electricity and water authority"],
  empower_cooling: ["empower", "cooling", "district cooling", "emirates central cooling", "emirates central cooling systems corporation"],
  ista: ["ista", "ista middle east", "ista middle east fze"],
  slack: ["slack", "slack technologies", "slack technologies limited"],
  canva: ["canva"],
  zapier: ["zapier", "zapier inc", "automation"],
  calendly: ["calendly", "calendly llc", "scheduling"],
  trello: ["trello", "trello inc"],
  loom: ["loom", "loom inc", "screen recording"],
  frameio: ["frame", "frame.io", "frameio", "frame io"],
  fathom: ["fathom", "fathom video", "fathom video inc", "meeting notes"],
  hootsuite: ["hootsuite", "hoot suite", "hootsuite media", "hootsuite media inc", "social scheduler"],
  manychat: ["manychat", "many chat", "chatbot"],
  xero: ["xero", "xero ltd"],
  gohire: ["gohire", "go hire", "gohire technologies", "gohire technologies ltd", "hiring", "ats", "recruiting"],
  jobsoid: ["jobsoid", "jobsoid inc"],
  smallpdf: ["smallpdf", "small pdf", "smallpdf ag", "pdf"],
  pdfbuddy: ["pdf buddy", "pdfbuddy"],
  jotform: ["jotform", "jot form", "form builder", "fastspring", "fast spring", "fastspring (jotform)"],
  dataflow: ["dataflow", "data flow", "verification", "dataflow verification", "dataflow services", "dataflow services fz llc"],
  moh: ["moh", "mohap", "ministry of health", "ministry of health and prevention", "health regulator"],
  dha: ["dha", "dubai health authority"],
  doh: ["doh", "department of health", "abu dhabi health"],
  scfhs: ["scfhs", "saudi commission", "saudi health", "saudi commission for health specialties"],
  prometric: ["prometric", "exam", "testing"],
  alsyed: ["al syed", "alsyed", "al syed translation", "translation"],
  telr: ["telr", "telr charges", "payment gateway"],
  promoclub: ["promoclub", "promo club", "promoclub services", "promoclub services - fzco"],
  dilo: ["dilo", "dilo creatives"],
  innovate_tech: ["innovate", "innovate technologies", "innovate technologies fzco"],
  leaders_minds: ["leaders minds", "leaders minds technologies"],
  commercial_clarity: ["commercial clarity", "commercial clarity partners", "commercial clarity partners llc"],
  business_setup: ["business setup", "business setup consultants", "business setup consultants dmcc"],
  simply_solved: ["simply solved", "simply solved accounting", "simply solved accounting bookkeeping", "simply solved human resources"],
  spark_back: ["spark back", "spark back training", "spark back training llc"],
  urban_uplifts: ["urban uplifts", "urban uplifts technical services", "urban uplifts technical services llc"],
  connection_chauffeur: ["connection chauffeur", "chauffeur", "limo"],
  payroll: ["payroll", "salary", "salaries", "wages", "wage", "staff", "staff cost", "employee", "employee salary", "remuneration", "director remuneration", "directors remuneration", "bonus", "commission", "commissions", "gratuity", "hr", "other benefits"],
  licensing: ["license", "licence", "licensing", "licenses", "licences", "permit", "permits", "visa", "visas", "prepaid visa", "compliance", "regulator", "regulatory", "health regulator licensing fee", "business licensing and compliance", "visa and permits"],
  marketing: ["marketing", "ads", "advert", "adverts", "advertising", "advertise", "digital marketing", "campaign", "campaigns", "paid media", "media buy", "promo", "social"],
  saas: ["saas", "software", "subscription", "subscriptions", "prepaid subscriptions", "tool", "tools", "app", "apps", "platform"],
  telecom: ["phone", "telephone", "telecom", "internet", "mobile", "wifi", "comms", "telephone and internet"],
  website: ["website", "web", "site", "seo", "web design", "webdev", "landing page", "website design and maintenance"],
  video_creative: ["video", "video content", "photography", "photo", "creative", "footage"],
  rent: ["rent", "lease", "rental", "office rent", "prepaid rent"],
  insurance: ["insurance", "insure", "cover", "policy", "business insurance", "prepaid insurance"],
  bank_fees: ["bank", "bank fee", "bank fees", "bank charge", "bank charges", "bank fees and charges"],
  tax: ["tax", "vat", "tax paid", "tax paid expense"],
  accounting: ["accounting", "audit", "bookkeeping", "accountant", "accounting tax and audit"],
  consultant: ["consultant", "consulting", "consultancy", "advisor", "advisory", "contractor", "consultant expense", "professional"],
  training: ["training", "course", "courses", "learning", "development", "workshop"],
  travel: ["travel", "trip", "accommodation", "hotel", "flight", "flights", "taxi", "careem", "uber", "travel and accommodation", "travel expenses"],
  depreciation: ["depreciation", "depreciate", "amortization", "amortisation", "leasehold", "computer equipment", "office equipment"],
  fx: ["fx", "forex", "exchange", "exchange gain", "exchange loss", "exchange gain or loss", "currency"],
  utilities: ["utility", "utilities", "electricity", "water", "power", "electricity water and other utilities"],
  office_admin: ["office", "admin", "stationery", "postage", "print", "printing", "supplies", "postage print and stationery", "repair", "maintenance"],
  kitchen: ["kitchen", "hygiene", "pantry", "cleaning", "kitchen and hygiene"],
  meals: ["meals", "subsistence", "food", "lunch"],
  hardware: ["hardware", "tech", "it hardware", "it and tech hardware", "computer", "laptop", "device", "equipment"],
  donation: ["donation", "charity", "charitable", "charitable donation"],
  credit: ["credit", "credits", "refund", "refunds", "vendor credit", "expense refund", "reversal"],
  t_expense: ["expense", "expenses", "spend", "spent", "cost"],
  t_bill: ["bill", "bills", "invoice", "invoiced", "inv"],
  t_journal: ["journal", "journals", "memo", "manual entry", "adjustment"],
};

/** Normalize identically for the index and the query. */
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Pre-normalize the alias map once at module load. Only SINGLE-WORD aliases
// index into the token map; multi-word brand phrases ("meta platforms ireland
// limited") are matched as substrings at index time — so generic words like
// "ireland"/"limited"/"company"/"expense" never pollute a concept.
const ALIAS_ENTRIES: [string, string[]][] = Object.entries(ALIAS_MAP).map(([k, arr]) => [k, arr.map(norm)]);
const TOKEN_TO_CONCEPTS = (() => {
  const m = new Map<string, Set<string>>();
  for (const [k, aliases] of ALIAS_ENTRIES)
    for (const a of aliases)
      if (!a.includes(" ") && a.length >= 2) { let s = m.get(a); if (!s) m.set(a, (s = new Set())); s.add(k); }
  return m;
})();
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const PAY_PREFIX = /^(wio|adcb|sme platinum|undeposited|accrued|prepaid)\b/;
const fuzzMax = (t: string) => (t.length <= 5 ? 1 : 2);

interface IdxRow {
  row: Row; key: string;
  nVendor: string; nCat: string;
  words: Set<string>; wordList: string[]; tags: Set<string>;
  absR: number; absT: number; amtStr: string; color: string;
  amount: number; date: string;
}

/** Build the per-row search index once per period. */
function buildIndex(all: Row[]): IdxRow[] {
  return all.map((row, i) => {
    const nText = norm(row.text), nCat = norm(row.category), nType = norm(row.type);
    const head = (row.text || "").split("·")[0].trim();
    const nVendor = PAY_PREFIX.test(norm(head)) ? "" : norm(head);
    const words = new Set<string>();
    for (const blob of [nText, nCat, nType]) for (const w of blob.split(" ")) if (w) words.add(w);
    // Make month name + year searchable (dates are ISO, e.g. "april" → 2026-04).
    const dm = (row.date || "").match(/^(\d{4})-(\d{2})/);
    if (dm) { words.add(dm[1]); const mn = MONTHS[+dm[2] - 1]; if (mn) { words.add(mn); words.add(mn.slice(0, 3)); } }
    // Alias tags: concepts hit by any single-word alias present, plus multi-word
    // brand phrases that appear as a substring of the vendor/category text.
    const tags = new Set<string>();
    for (const w of words) { const cs = TOKEN_TO_CONCEPTS.get(w); if (cs) for (const c of cs) tags.add(c); }
    const blob2 = `${nText} ${nCat}`;
    for (const [k, aliases] of ALIAS_ENTRIES)
      if (!tags.has(k)) for (const a of aliases) if (a.includes(" ") && blob2.includes(a)) { tags.add(k); break; }
    const absR = Math.round(Math.abs(row.amount)), absT = Math.trunc(Math.abs(row.amount));
    return {
      row, key: `${row.date}|${row.category}|${Math.round(row.amount)}|${i}`,
      nVendor, nCat, words, wordList: [...words], tags,
      absR, absT, amtStr: `${absR} ${absT}`, color: groupFor(row.category).color,
      amount: row.amount, date: row.date,
    };
  });
}

const TIER = { exact: 600, prefix: 400, word: 250, alias: 200, substr: 120, numeric: 90, fuzzy: 60 };

interface ExTerm { term: string; isNum: boolean; tags: Set<string> }
/** Expand one query term into the concepts it activates (incl. typo-tolerant). */
function expandTerm(term: string): ExTerm {
  const isNum = /^\d+$/.test(term);
  const tags = new Set<string>();
  if (!isNum) {
    const direct = TOKEN_TO_CONCEPTS.get(term);
    if (direct) for (const c of direct) tags.add(c);
    if (term.length >= 3)
      for (const [k, aliases] of ALIAS_ENTRIES)
        if (!tags.has(k))
          for (const a of aliases)
            if (a === term || a.startsWith(term) || a.split(" ").some(w => w.startsWith(term))) { tags.add(k); break; }
    // Typo-tolerant: a near-miss of an alias word activates its concept, so
    // "fcebook" still expands to Meta (matched via the alias tier, not noise).
    if (term.length >= 4) {
      const mx = fuzzMax(term);
      for (const [k, aliases] of ALIAS_ENTRIES)
        if (!tags.has(k))
          for (const a of aliases)
            if (a.split(" ").some(w => w.length >= 4 && Math.abs(w.length - term.length) <= mx && withinEdits(term, w, mx))) { tags.add(k); break; }
    }
  }
  return { term, isNum, tags };
}

/** Bounded Damerau-Levenshtein — returns true if within `max` edits. */
function withinEdits(a: string, b: string, max: number): boolean {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  let prevPrev: number[] = [], prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prevPrev[j - 2] + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prevPrev = prev; const t = prev; prev = cur; cur = t;
  }
  return prev[lb] <= max;
}
/** Fuzzy match against the row's OWN words only (never the global alias list). */
function fuzzyHit(idx: IdxRow, term: string): boolean {
  const max = fuzzMax(term);
  for (const w of idx.wordList) if (w.length >= 3 && Math.abs(w.length - term.length) <= max && withinEdits(term, w, max)) return true;
  return false;
}

/** Best tier one term achieves on one row (0 = no match). */
function termTier(idx: IdxRow, ex: ExTerm): number {
  const t = ex.term;
  if (ex.isNum) {
    const n = Number(t);
    if (idx.absR === n || idx.absT === n) return TIER.exact;
    if (idx.amtStr.includes(t)) return TIER.numeric;
    for (const w of idx.words) if (w.includes(t)) return TIER.substr; // ref numbers
    return 0;
  }
  if (idx.nVendor === t || idx.nCat === t) return TIER.exact;
  if ((idx.nVendor && idx.nVendor.startsWith(t)) || idx.nCat.startsWith(t)) return TIER.prefix;
  for (const w of idx.words) if (w.startsWith(t)) return TIER.word;
  if (ex.tags.size) for (const k of ex.tags) if (idx.tags.has(k)) return TIER.alias;
  if (t.length >= 3) for (const w of idx.words) if (w.includes(t)) return TIER.substr;
  if (t.length >= 4 && fuzzyHit(idx, t)) return TIER.fuzzy;
  return 0;
}

/** Match + rank the index against a raw query. Returns ranked IdxRows. */
function runSearch(index: IdxRow[], qRaw: string): IdxRow[] {
  const nq = norm(qRaw);
  if (!nq) return index; // empty → all, already newest-first
  const terms = nq.split(" ").map(expandTerm);
  const scored: { ix: IdxRow; score: number }[] = [];
  for (const ix of index) {
    let sum = 0, worst = Infinity, pass = true;
    for (const ex of terms) {
      const tier = termTier(ix, ex);
      if (!tier) { pass = false; break; }
      sum += tier; if (tier < worst) worst = tier;
    }
    if (pass) scored.push({ ix, score: worst * 1000 + sum });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    Math.abs(b.ix.amount) - Math.abs(a.ix.amount) ||
    b.ix.date.localeCompare(a.ix.date) ||
    a.ix.key.localeCompare(b.ix.key));
  return scored.map(s => s.ix);
}

function rangeLabel(r: { from: Date; to: Date }) {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "2-digit" };
  return `${r.from.toLocaleDateString("en-GB", o)} – ${r.to.toLocaleDateString("en-GB", o)}`;
}

export function ExpenseSearch({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const [active, setActive] = useState(false);  // lazily trigger the heavy GL fetch
  const [q, setQ] = useState("");
  const { data: ledger, isLoading } = useZohoAccountTxns(dateRange, active);
  const { fmt } = useCurrency();

  const cardRef  = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const openedRef = useRef(false), panelOpenedRef = useRef(false), staggeredRef = useRef(false);
  const seenKeys = useRef<Set<string>>(new Set());
  const prm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Flatten the per-account ledger, newest first.
  const all = useMemo<Row[]>(() => {
    if (!ledger?.accounts) return [];
    const out: Row[] = [];
    for (const [category, txns] of Object.entries(ledger.accounts))
      for (const t of txns) out.push({ date: t.date, category, type: t.type, text: t.text, amount: t.amount });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger]);

  const index   = useMemo(() => buildIndex(all), [all]);            // once per period
  const results = useMemo(() => runSearch(index, q), [index, q]);   // per keystroke
  const total   = results.reduce((s, ix) => s + ix.amount, 0);
  const shown   = results.slice(0, CAP);

  // New period → replay the open animations on next activation.
  useEffect(() => {
    panelOpenedRef.current = false; staggeredRef.current = false; seenKeys.current.clear();
  }, [all]);

  // Phase A — card rise/settle, once, the moment search activates.
  useEffect(() => {
    if (!active || openedRef.current) return;
    openedRef.current = true;
    if (prm || !cardRef.current) return;
    gsap.from(cardRef.current, { y: 12, autoAlpha: 0.4, scale: 0.99, duration: 0.45, ease: "power3.out" });
  }, [active, prm]);

  // Phase B — expand the results panel open, once (capped at its scroll max).
  useLayoutEffect(() => {
    if (!active || isLoading || !panelRef.current || panelOpenedRef.current) return;
    panelOpenedRef.current = true;
    if (prm) return;
    const el = panelRef.current, h = Math.min(el.scrollHeight, 440);
    gsap.fromTo(el, { height: 0, autoAlpha: 0 },
      { height: h, autoAlpha: 1, duration: 0.4, ease: "power2.inOut", onComplete: () => { el.style.height = "auto"; } });
  }, [active, isLoading]);

  // Phase C — stagger the first rows in, once; seed seenKeys so typing won't replay.
  useEffect(() => {
    if (!active || isLoading || staggeredRef.current || !tbodyRef.current) return;
    const rows = Array.from(tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-key]"));
    if (!rows.length) return;
    staggeredRef.current = true;
    rows.forEach(r => r.dataset.key && seenKeys.current.add(r.dataset.key));
    if (prm) return;
    gsap.from(rows.slice(0, 30), { opacity: 0, y: 8, duration: 0.32, ease: "power2.out", stagger: 0.018 });
  }, [active, isLoading, results]);

  // Phase D — per keystroke, fade in ONLY rows whose key hasn't been seen.
  useLayoutEffect(() => {
    if (!active || isLoading || !staggeredRef.current || !tbodyRef.current) return;
    const fresh: HTMLElement[] = [];
    tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-key]").forEach(tr => {
      const k = tr.dataset.key;
      if (k && !seenKeys.current.has(k)) { fresh.push(tr); seenKeys.current.add(k); }
    });
    if (prm || !fresh.length) return;
    gsap.fromTo(fresh, { opacity: 0, x: -4 }, { opacity: 1, x: 0, duration: 0.18, ease: "power1.out", stagger: 0.006 });
  }, [q, active, isLoading]);

  // Phase E — pulse the match count when it changes.
  useEffect(() => {
    if (!active || isLoading || prm || !countRef.current) return;
    gsap.fromTo(countRef.current, { scale: 1.08 }, { scale: 1, duration: 0.18, ease: "power1.out" });
  }, [results.length, active, isLoading, prm]);

  // Kill any in-flight tweens on unmount.
  useEffect(() => () => { gsap.killTweensOf([cardRef.current, panelRef.current]); }, []);

  return (
    <Card ref={cardRef} className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-[13px] font-semibold text-foreground">Search expenses</CardTitle>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Every expense in Zoho Books for the selected period — by vendor, account, type or amount. Smart aliases: try “facebook”, “payroll”, “telecom”.
        </p>
        <div className="relative mt-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onFocus={() => setActive(true)}
            onChange={e => { setActive(true); setQ(e.target.value); }}
            placeholder='e.g. "facebook", "salary", "licensing", "scaled ai", "252239"…'
            className="pl-9 h-9 text-[13px]"
          />
        </div>
        {active && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading expenses from Zoho…</span>
            ) : (
              <><span ref={countRef} className="inline-block font-semibold text-foreground/80">{results.length.toLocaleString()}</span> match{results.length === 1 ? "" : "es"} · <span className="font-semibold text-foreground/80 tabular-nums">{fmt(total)}</span> · {rangeLabel(dateRange)}</>
            )}
          </p>
        )}
      </CardHeader>

      {active && !isLoading && (
        <CardContent className="px-0 pb-3">
          <div ref={panelRef} className="max-h-[440px] overflow-y-auto border-t border-border/40">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Account</th>
                  <th className="py-2.5 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Description</th>
                  <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {shown.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-[12.5px] text-muted-foreground">
                    No expenses match {q ? <>“{q}”</> : "this period"}.
                  </td></tr>
                ) : shown.map(ix => (
                  <tr key={ix.key} data-key={ix.key} className="border-b border-border/25 last:border-0 odd:bg-muted/15 hover:bg-blue-50/50 transition-colors">
                    <td className="py-2.5 px-5 text-[12px] font-mono text-muted-foreground whitespace-nowrap align-top">{ix.row.date || "—"}</td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground/80 whitespace-nowrap">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ix.color }} />
                        {ix.row.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-[420px]">
                      <div className="flex items-center gap-2 min-w-0">
                        {ix.row.type ? <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/70 bg-muted/70 rounded px-1.5 py-0.5">{ix.row.type}</span> : null}
                        <span className="text-[12.5px] text-foreground/85 truncate" title={ix.row.text}>{ix.row.text || <span className="text-muted-foreground/40">—</span>}</span>
                      </div>
                    </td>
                    <td className={`py-2.5 px-5 text-[12.5px] text-right tabular-nums font-semibold align-top ${ix.amount < 0 ? "text-emerald-700" : "text-foreground"}`}>{fmt(ix.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length > CAP && (
              <p className="px-5 py-2.5 text-[11px] text-muted-foreground border-t border-border/40">
                Showing the {CAP} most relevant of {results.length.toLocaleString()} matches — refine your search to narrow it down.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

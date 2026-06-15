/**
 * Documentation — the in-portal docs viewer.
 *
 * Renders the markdown files under /docs (repo root) right inside the dashboard
 * so the team never has to be sent a pile of Word files. The .md files stay the
 * single source of truth; this page loads them at build time via Vite's glob
 * import and renders them with react-markdown. Add a new .md under docs/ (or a
 * subfolder) and it shows up here automatically — subfolders become nav groups.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

// Pull every markdown file under docs/ as a raw string, at build time.
const RAW = import.meta.glob("../../docs/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface DocEntry {
  slug:    string;   // e.g. "00-overview-and-architecture" or "sales/calls"
  title:   string;   // first H1, cleaned
  group:   string;   // folder key ("_root" for top level)
  content: string;
}

// Folders render in this order; anything else is appended after, alphabetically.
const GROUP_ORDER = ["_root", "hospital-introduction", "sales", "growth", "admin", "systems", "public"];
const GROUP_LABEL: Record<string, string> = {
  _root: "Getting started",
  "hospital-introduction": "Hospital Introduction",
  sales: "Sales",
  growth: "Growth",
  admin: "Admin",
  systems: "Systems & cross-cutting",
  public: "Public pages",
};

function toSlug(path: string): string {
  return path.replace(/^.*\/docs\//, "").replace(/\.md$/, "");
}
function firstHeading(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/^\d+\s*[—–-]\s*/, "").trim() : fallback;
}
// Sort key: README first, then numbered files, then the rest.
function rootOrderKey(slug: string): string {
  if (slug.toLowerCase() === "readme") return "0";
  return slug;
}

const ENTRIES: DocEntry[] = Object.entries(RAW)
  .map(([path, content]) => {
    const slug = toSlug(path);
    const group = slug.includes("/") ? slug.split("/")[0] : "_root";
    return { slug, content, group, title: firstHeading(content, slug) };
  })
  .sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group); const gb = GROUP_ORDER.indexOf(b.group);
    const oa = ga === -1 ? 999 : ga; const ob = gb === -1 ? 999 : gb;
    if (oa !== ob) return oa - ob;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    const ka = a.group === "_root" ? rootOrderKey(a.slug) : a.slug;
    const kb = b.group === "_root" ? rootOrderKey(b.slug) : b.slug;
    return ka.localeCompare(kb);
  });

const DEFAULT_SLUG = ENTRIES.find(e => e.slug.toLowerCase() === "readme")?.slug
  ?? ENTRIES[0]?.slug ?? "";

/** Resolve a relative `*.md` link (from inside a doc) to a known doc slug, so
 *  cross-references switch the viewer instead of trying to open a file. */
function resolveDocSlug(href: string, currentSlug: string): string | null {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean.endsWith(".md")) return null;
  const target = clean.replace(/\.md$/, "");
  const baseDir = currentSlug.includes("/") ? currentSlug.split("/").slice(0, -1) : [];
  const parts = [...baseDir];
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    else if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const slug = parts.join("/");
  return ENTRIES.some(e => e.slug === slug) ? slug : null;
}

export default function Docs() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");

  const active = ENTRIES.find(e => e.slug === params.get("p")) ?? ENTRIES.find(e => e.slug === DEFAULT_SLUG) ?? ENTRIES[0];
  const select = (slug: string) => setParams(slug === DEFAULT_SLUG ? {} : { p: slug });

  // Filter the nav by title + content (so search finds a doc by what's in it).
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => !q ? ENTRIES : ENTRIES.filter(e => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)),
    [q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, DocEntry[]>();
    for (const e of filtered) { if (!map.has(e.group)) map.set(e.group, []); map.get(e.group)!.push(e); }
    return [...map.entries()];
  }, [filtered]);

  if (!active) {
    return <div className="p-8 text-sm text-muted-foreground">No documentation found.</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="flex items-center gap-2 mb-5">
        <BookOpen className="h-5 w-5 text-teal-600" />
        <h1 className="text-lg font-semibold">Documentation</h1>
        <span className="text-xs text-muted-foreground">· how to use the dashboard &amp; how it works</span>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left nav */}
        <nav className="md:sticky md:top-4 self-start space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search the docs…"
              className="pl-8 h-9 text-[13px]"
            />
          </div>

          {groups.length === 0 && (
            <div className="text-[12px] text-muted-foreground px-1">No matches for “{query}”.</div>
          )}

          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {GROUP_LABEL[group] ?? group.replace(/-/g, " ")}
              </div>
              <ul className="space-y-0.5">
                {items.map(e => {
                  const isActive = e.slug === active.slug;
                  return (
                    <li key={e.slug}>
                      <button
                        onClick={() => select(e.slug)}
                        className={`w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                          isActive ? "bg-teal-50 text-teal-800 font-medium" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-teal-600" : "text-slate-400"}`} />
                        <span className="truncate">{e.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Content */}
        <article className="prose prose-slate max-w-none min-w-0 prose-headings:scroll-mt-20 prose-h1:text-2xl prose-h2:text-xl prose-h2:mt-10 prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-1.5 prose-a:text-teal-700 prose-table:text-[13px] prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...rest }) => {
                const docSlug = href ? resolveDocSlug(href, active.slug) : null;
                if (docSlug) {
                  return (
                    <a
                      href={`?p=${docSlug}`}
                      onClick={(ev) => { ev.preventDefault(); select(docSlug); window.scrollTo({ top: 0 }); }}
                      {...rest}
                    >
                      {children}
                    </a>
                  );
                }
                // Repo-relative source link (e.g. file:line) — leave as-is but
                // don't blow up; external links open in a new tab.
                const external = href?.startsWith("http");
                return (
                  <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} {...rest}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {active.content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Download, Loader2, UserSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useWpCandidates, type WpCandidate } from "@/hooks/use-wp-candidates";
import { buildDoctorProfileHtml, PROFILE_IMAGE_WIDTH } from "@/lib/doctor-profile-image";
import { captureCardPng, downloadBlob } from "@/lib/card-screenshot";

/**
 * Doctors → Generate image. Pick any WordPress candidate and render a PNG of
 * their profile — the WP fields flow into the doctor-profile-mockup HTML
 * (buildDoctorProfileHtml) and html2canvas rasterises it. View-only for now
 * (no send/attach). Empty fields are dropped by the HTML builder.
 */
export default function GenerateProfileImage() {
  const { data: candidates = [], isLoading } = useWpCandidates();
  const [params] = useSearchParams();
  const query = (params.get("q") ?? "").trim().toLowerCase();

  const [selected, setSelected] = useState<WpCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  // Revoke the last object URL on unmount / replace so we don't leak.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const results = useMemo(() => {
    const base = candidates.filter(c => c.full_name || c.title);
    if (!query) return base.slice(0, 40);
    return base
      .filter(c =>
        (c.full_name ?? "").toLowerCase().includes(query) ||
        (c.title ?? "").toLowerCase().includes(query) ||
        (c.specialty ?? "").toLowerCase().includes(query) ||
        (c.job_title ?? "").toLowerCase().includes(query) ||
        (c.email ?? "").toLowerCase().includes(query))
      .slice(0, 60);
  }, [candidates, query]);

  const generate = async (c: WpCandidate) => {
    setSelected(c);
    setBusy(true);
    try {
      const blob = await captureCardPng(buildDoctorProfileHtml(c), { width: PROFILE_IMAGE_WIDTH });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      blobRef.current = blob;
      setImgUrl(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate the image.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!blobRef.current || !selected) return;
    const safe = (selected.full_name || selected.title || "doctor").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    downloadBlob(blobRef.current, `${safe}-profile.png`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Doctor picker */}
      <Card className="h-fit">
        <CardContent className="p-0">
          <div className="px-3 py-2.5 border-b text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserSquare className="h-3.5 w-3.5 text-teal-600" />
            {query ? `${results.length} match${results.length === 1 ? "" : "es"}` : `${candidates.length} doctors`}
            <span className="ml-auto normal-case tracking-normal text-[10px]">Search above to filter</span>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {isLoading && <div className="px-3 py-4 text-[11px] text-muted-foreground">Loading doctors…</div>}
            {!isLoading && results.length === 0 && (
              <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">No doctors match your search.</div>
            )}
            {results.map(c => {
              const isSel = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => generate(c)}
                  className={`w-full text-left px-3 py-2 border-l-2 transition-colors hover:bg-slate-50 ${
                    isSel ? "border-teal-500 bg-teal-50/40" : "border-transparent"
                  }`}
                >
                  <div className="text-[12.5px] font-medium truncate text-slate-800">{c.full_name || c.title || "Unnamed"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[c.job_title, c.specialty].filter(Boolean).join(" · ") || "—"}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Image preview */}
      <Card>
        <CardContent className="p-4">
          {!selected && !imgUrl ? (
            <div className="py-24 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-3 text-teal-500/70" />
              <div className="text-[13px] font-medium text-slate-700">Pick a doctor to generate their profile image</div>
              <div className="text-[11.5px] mt-1">The profile is built from their WordPress record. Empty fields are left out.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-teal-600" />
                    {selected?.full_name || selected?.title || "Profile"}
                    <Badge variant="outline" className="text-[9px] bg-slate-50">image preview</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected && (
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={busy} onClick={() => generate(selected)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                      Regenerate
                    </Button>
                  )}
                  <Button size="sm" className="h-8 text-[11px]" disabled={!imgUrl || busy} onClick={download}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download PNG
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-slate-100/60 p-3 overflow-auto">
                {busy && !imgUrl && (
                  <div className="py-24 text-center text-[12px] text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-teal-600" /> Rendering profile…
                  </div>
                )}
                {imgUrl && (
                  <div className="relative">
                    {busy && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                      </div>
                    )}
                    <img src={imgUrl} alt="Doctor profile" className="w-full h-auto rounded shadow-sm bg-white" />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

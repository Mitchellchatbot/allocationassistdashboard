import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Dependency-free world choropleth. Renders a bundled world-countries GeoJSON as
 * inline SVG with our own equirectangular projection (no mapping library → zero
 * lockfile risk, no external/runtime requests). Darker = more. Countries with no
 * value render light grey. The 257KB GeoJSON is dynamic-imported so it lands in
 * its own lazily-loaded chunk, not the page bundle.
 *
 * `values` is keyed by the GeoJSON country name (properties.name) — the caller
 * aliases its own country names to these (see COUNTRY_TO_GEO in GeographyCard).
 */
interface GeoFeature {
  id: string;
  properties: { name: string };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

// Equirectangular projection cropped to skip most of Antarctica so the
// populated world fills the frame. Bounds include Greenland's top (~84N) and
// South America's tip (~-56) so nothing lands flush against the edge.
const W = 1000;
const LAT_TOP = 84;
const LAT_BOTTOM = -57;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360); // keep aspect (~392)

// A hovered country rises by LIFT user-units; the viewBox gets matching top
// headroom (+ a little margin all round) so lifted northern countries and their
// drop-shadow aren't clipped — this also fixes the "a bit cropped" edges.
const LIFT = 11;
const PAD_X = 6;
const PAD_TOP = LIFT + 8;
const PAD_BOTTOM = 6;

const projectX = (lon: number) => ((lon + 180) / 360) * W;
const projectY = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H;

function ringToPath(ring: number[][]): string {
  let d = "";
  for (let i = 0; i < ring.length; i++) {
    const x = projectX(ring[i][0]).toFixed(1);
    const y = projectY(ring[i][1]).toFixed(1);
    d += (i === 0 ? "M" : "L") + x + " " + y;
  }
  return d + "Z";
}
function featureToPath(geom: GeoFeature["geometry"]): string {
  if (geom.type === "Polygon") return geom.coordinates.map(ringToPath).join("");
  return (geom.coordinates as number[][][][]).map(poly => poly.map(ringToPath).join("")).join("");
}

/** Light→dark interpolation between two teal endpoints, sqrt-scaled so small
 *  counts are still visibly tinted. */
function fillFor(value: number, max: number): string {
  if (!value || value <= 0) return "#eef2f6";
  const t = max > 0 ? Math.sqrt(value / max) : 0;
  const k = 0.18 + 0.82 * t; // floor so 1 lead isn't invisible
  const c0 = [201, 233, 229]; // light teal
  const c1 = [12, 74, 68];    // deep teal
  const c = c0.map((a, i) => Math.round(a + (c1[i] - a) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function WorldChoropleth({
  values,
  formatValue = (n: number) => n.toLocaleString(),
  className,
}: {
  values: Map<string, number>;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const [features, setFeatures] = useState<GeoFeature[] | null>(null);
  // Split so moving the mouse (position only) doesn't re-render all 180 paths —
  // only `hovered.name` changing (crossing into a new country) reorders/re-fills.
  const [hovered, setHovered] = useState<{ name: string; value: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Lazy-load the GeoJSON (own chunk). Only once.
  useEffect(() => {
    let alive = true;
    import("@/assets/geo/world-countries.json")
      .then(mod => { if (alive) setFeatures(((mod.default ?? mod) as { features: GeoFeature[] }).features); })
      .catch(() => { if (alive) setFeatures([]); });
    return () => { alive = false; };
  }, []);

  // Project every country once (static) — only fills change on data/hover.
  const paths = useMemo(
    () => (features ?? []).map(f => ({ key: f.properties.name, d: featureToPath(f.geometry) })),
    [features],
  );

  const max = useMemo(() => {
    let m = 0;
    for (const v of values.values()) if (v > m) m = v;
    return m;
  }, [values]);

  // Paint the hovered country LAST so its lift + shadow sit above its neighbours.
  // Stable keys mean React moves the node (no remount), so the lift transitions.
  const ordered = useMemo(() => {
    if (!hovered) return paths;
    const one = paths.find(p => p.key === hovered.name);
    return one ? [...paths.filter(p => p.key !== hovered.name), one] : paths;
  }, [paths, hovered]);

  if (features === null) {
    return (
      <div className={className} style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted/30 text-[12px] text-muted-foreground animate-pulse">
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={className} style={{ position: "relative" }}>
      <svg
        viewBox={`${-PAD_X} ${-PAD_TOP} ${W + PAD_X * 2} ${H + PAD_TOP + PAD_BOTTOM}`}
        className="w-full h-auto"
        role="img"
        aria-label="World map of counts by country"
        onMouseLeave={() => { setHovered(null); setTip(null); }}
      >
        {ordered.map(p => {
          const v = values.get(p.key) ?? 0;
          const isHover = hovered?.name === p.key;
          return (
            <path
              key={p.key}
              d={p.d}
              fill={fillFor(v, max)}
              stroke={isHover ? "#0f766e" : "#ffffff"}
              strokeWidth={isHover ? 0.9 : 0.4}
              style={{
                transform: isHover ? `translateY(-${LIFT}px)` : "translateY(0)",
                transition: "transform 160ms ease, stroke-width 160ms ease",
                filter: isHover ? "drop-shadow(0 3px 3px rgba(15,23,42,0.38))" : undefined,
                cursor: v > 0 ? "pointer" : "default",
              }}
              onMouseEnter={() => setHovered({ name: p.key, value: v })}
              onMouseMove={e => {
                const rect = wrapRef.current?.getBoundingClientRect();
                setTip({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
              }}
            />
          );
        })}
      </svg>

      {hovered && tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
          style={{ left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 0) - 130), top: tip.y + 12 }}
        >
          <div className="font-semibold">{hovered.name}</div>
          <div className="text-white/80">{hovered.value > 0 ? formatValue(hovered.value) : "—"}</div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>Fewer</span>
        <div className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, #cbe9e5, #0c4a44)" }} />
        <span>More</span>
        {max > 0 && <span className="ml-1 tabular-nums">· peak {formatValue(max)}</span>}
      </div>
    </div>
  );
}

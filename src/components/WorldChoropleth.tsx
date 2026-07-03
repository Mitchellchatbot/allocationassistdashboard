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

// Equirectangular projection cropped to skip most of Antarctica / far north so
// the populated world fills the frame.
const W = 1000;
const LAT_TOP = 83;
const LAT_BOTTOM = -56;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360); // keep aspect

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
  const [hover, setHover] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
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
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="World map of counts by country"
        onMouseLeave={() => setHover(null)}
      >
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
        {paths.map(p => {
          const v = values.get(p.key) ?? 0;
          return (
            <path
              key={p.key}
              d={p.d}
              fill={fillFor(v, max)}
              stroke="#ffffff"
              strokeWidth={0.4}
              className="transition-[fill] duration-300"
              style={{ cursor: v > 0 ? "pointer" : "default" }}
              onMouseMove={e => {
                const rect = wrapRef.current?.getBoundingClientRect();
                setHover({ name: p.key, value: v, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
              }}
              onMouseEnter={e => {
                const rect = wrapRef.current?.getBoundingClientRect();
                setHover({ name: p.key, value: v, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
              }}
            />
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
          style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 0) - 130), top: hover.y + 12 }}
        >
          <div className="font-semibold">{hover.name}</div>
          <div className="text-white/80">{hover.value > 0 ? formatValue(hover.value) : "—"}</div>
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

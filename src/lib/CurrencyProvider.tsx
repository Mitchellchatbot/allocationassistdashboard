import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

// The UAE dirham is pegged to the US dollar at 3.6725 (since 1997). We still
// look up the live rate in the background and use it when the lookup succeeds,
// falling back to the peg so conversions keep working offline / on failure.
const AED_PER_USD_PEG = 3.6725;

export type Currency = "AED" | "USD";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Convert an AED value into the currently-selected display currency. */
  fromAED: (v: number) => number;
  /** Format a number (in AED) with the active currency code. */
  fmt: (v: number) => string;
  /** AED per 1 USD — the live looked-up rate, or the peg as a fallback. */
  rate: number;
  /** Where `rate` came from. */
  rateSource: "live" | "peg";
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "AED",
  setCurrency: () => {},
  fromAED: v => v,
  fmt: v => `AED ${Math.round(v).toLocaleString()}`,
  rate: AED_PER_USD_PEG,
  rateSource: "peg",
});

function format(v: number, code: Currency): string {
  if (!Number.isFinite(v)) return `${code} 0`;
  const sign = v < 0 ? "-" : "";
  const abs  = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}${code} ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${code} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${code} ${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("AED");
  const [rate, setRate]             = useState(AED_PER_USD_PEG);
  const [rateSource, setRateSource] = useState<"live" | "peg">("peg");

  // Look up the live USD→AED rate once on mount. Keyless, CORS-friendly API;
  // on any failure we silently keep the peg.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!res.ok) return;
        const j = await res.json() as { rates?: { AED?: number } };
        const aed = j?.rates?.AED;
        if (!cancelled && typeof aed === "number" && aed > 0) {
          setRate(aed);
          setRateSource("live");
        }
      } catch { /* keep the peg */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fromAED = useCallback(
    (v: number) => (currency === "USD" ? v / rate : v),
    [currency, rate],
  );
  const fmt = useCallback((v: number) => format(fromAED(v), currency), [fromAED, currency]);
  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fromAED, fmt, rate, rateSource }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

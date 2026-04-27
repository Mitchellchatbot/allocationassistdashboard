import { createContext, useContext, useState, ReactNode, useCallback } from "react";

// Peg matches the one used on the Meta Ads page (`AED_PER_USD_PEG`).
const AED_PER_USD = 3.6725;

export type Currency = "AED" | "USD";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Convert an AED value into the currently-selected display currency. */
  fromAED: (v: number) => number;
  /** Format a number (in display currency) with the active currency code. */
  fmt: (v: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "AED",
  setCurrency: () => {},
  fromAED: v => v,
  fmt: v => `AED ${Math.round(v).toLocaleString()}`,
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
  const fromAED = useCallback(
    (v: number) => (currency === "USD" ? v / AED_PER_USD : v),
    [currency],
  );
  const fmt = useCallback((v: number) => format(fromAED(v), currency), [fromAED, currency]);
  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fromAED, fmt }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

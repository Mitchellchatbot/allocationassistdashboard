import { useCurrency } from "@/lib/CurrencyProvider";

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className="inline-flex h-7 rounded-md border border-border/60 overflow-hidden text-[10px] font-medium shrink-0">
      <button
        type="button"
        onClick={() => setCurrency("AED")}
        className={`px-2.5 transition-colors ${currency === "AED" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
      >
        AED
      </button>
      <button
        type="button"
        onClick={() => setCurrency("USD")}
        className={`px-2.5 transition-colors ${currency === "USD" ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"}`}
      >
        USD
      </button>
    </div>
  );
}

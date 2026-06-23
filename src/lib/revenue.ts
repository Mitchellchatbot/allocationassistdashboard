// Revenue per converted doctor — AED canonical (the business books placements
// in AED), USD is derived using the same peg as CurrencyProvider. Single
// source of truth so Marketing and Finance agree when ranking channels by
// revenue. Consumers multiply by the AED value and let the currency toggle
// convert AED→USD on display, so flipping the canonical here is all it takes.
const AED_PER_USD                       = 3.6725;
export const REVENUE_PER_CONVERSION_AED = 20000;
export const REVENUE_PER_CONVERSION_USD = REVENUE_PER_CONVERSION_AED / AED_PER_USD;

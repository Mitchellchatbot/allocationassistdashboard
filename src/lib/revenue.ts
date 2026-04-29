// Revenue per converted doctor — USD canonical, AED conversion uses the same
// peg as CurrencyProvider. Single source of truth so Marketing and Finance
// agree when ranking channels by revenue.
export const REVENUE_PER_CONVERSION_USD = 5000;
const AED_PER_USD                       = 3.6725;
export const REVENUE_PER_CONVERSION_AED = REVENUE_PER_CONVERSION_USD * AED_PER_USD;

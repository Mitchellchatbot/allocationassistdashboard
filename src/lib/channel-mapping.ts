/**
 * Channel-name normalization shared between marketing-spend categories
 * (e.g. "Meta Ads", "LinkedIn", "SEO") and Zoho lead sources (which already
 * pass through `displaySource()` from use-zoho-data).
 *
 * Both sides go through `normalizeChannelKey()` to land on the same canonical
 * key so we can join leads and spend per channel.
 */

export type ChannelKey =
  | "Meta"     | "LinkedIn" | "Google Ads" | "TikTok"
  | "YouTube"  | "Snapchat" | "Twitter"  | "WhatsApp"
  | "Website / SEO" | "Landing Page" | "Referrals" | "Email" | "Influencer"
  | "Print"    | "Outdoor"  | "Radio"    | "TV"     | "Events"
  | "Go Hire"  | "Dave"     | "Other";

const RULES: { match: RegExp; key: ChannelKey }[] = [
  // Meta = Facebook + Instagram + Messenger + Audience Network (all Meta-owned).
  // Substring matches catch any placement variant (Facebook_Mobile_Feed, etc.).
  { match: /facebook|instagram|messenger|audience[\s_]?network|^fb$|^ig$|meta\s*ads?|^meta$/i, key: "Meta" },
  { match: /linkedin/i,                                    key: "LinkedIn" },
  { match: /google\s*ad|adwords|sem|paid\s*search/i,       key: "Google Ads" },
  { match: /tiktok/i,                                      key: "TikTok" },
  { match: /youtube/i,                                     key: "YouTube" },
  { match: /snapchat/i,                                    key: "Snapchat" },
  { match: /twitter|^x$|x\.com/i,                          key: "Twitter" },
  { match: /whatsapp/i,                                    key: "WhatsApp" },
  // Website / SEO = website + SEO + ChatGPT + the website chatbot widget
  // (single organic-web channel) — chatbot leads + conversions roll in here.
  { match: /^seo$|seo\s*\/\s*organic|organic|search\s*engine\s*opt|website|web\s*direct|chatgpt|openai|^gpt$|chatbot|care\s*assist/i, key: "Website / SEO" },
  { match: /landing\s*page/i,                              key: "Landing Page" },
  { match: /referr|word\s*of\s*mouth/i,                    key: "Referrals" },
  { match: /email|newsletter|mailchimp/i,                  key: "Email" },
  { match: /influencer/i,                                  key: "Influencer" },
  { match: /print|magazine|newspaper/i,                    key: "Print" },
  { match: /outdoor|billboard/i,                           key: "Outdoor" },
  { match: /radio/i,                                       key: "Radio" },
  { match: /^tv$|television/i,                             key: "TV" },
  { match: /event|conference|expo/i,                       key: "Events" },
  { match: /go\s*hire|gohire/i,                            key: "Go Hire" },
  // Dave's recruitment fees are filed under "DILO" in marketing_expenses but
  // appear as "Dave" on the lead side (Lead_Source). Map both → "Dave" so
  // his spend and conversions land on the same channel row.
  { match: /^dave$|^dilo$/i,                               key: "Dave" },
];

export function normalizeChannelKey(raw: string | null | undefined): ChannelKey {
  if (!raw) return "Other";
  const s = raw.trim();
  if (!s) return "Other";
  for (const r of RULES) if (r.match.test(s)) return r.key;
  return "Other";
}

// Vendor → channel overrides for Books-billed marketing spend. The vendor name
// is usually the channel, but some need a manual mapping confirmed by the team:
//   - Scaled AI LLC    → AA's Website / SEO work (no keyword to match on)
//   - LinkedIn Ireland → also AA's Website / SEO (NOT a LinkedIn ad channel)
// Add a line to map another vendor. Meta is handled by the live Meta API, so
// Meta-classified rows are dropped elsewhere to avoid double-counting Meta bills.
export const VENDOR_CHANNEL_OVERRIDES: { match: RegExp; channel: ChannelKey }[] = [
  { match: /scaled\s*ai/i, channel: "Website / SEO" },
  { match: /linkedin/i,    channel: "Website / SEO" },
];

/** Like normalizeChannelKey but applies the vendor overrides first — use this
 *  to classify Zoho Books marketing transactions (where the text is the vendor
 *  name + reference + description). */
export function classifyChannel(text: string | null | undefined): ChannelKey {
  if (!text) return "Other";
  for (const o of VENDOR_CHANNEL_OVERRIDES) if (o.match.test(text)) return o.channel;
  return normalizeChannelKey(text);
}

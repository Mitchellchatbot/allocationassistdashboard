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
  // Meta = Facebook + Instagram (single channel; both owned by Meta)
  { match: /facebook|instagram|^fb$|^ig$|meta\s*ads?|^meta$/i, key: "Meta" },
  { match: /linkedin/i,                                    key: "LinkedIn" },
  { match: /google\s*ad|adwords|sem|paid\s*search/i,       key: "Google Ads" },
  { match: /tiktok/i,                                      key: "TikTok" },
  { match: /youtube/i,                                     key: "YouTube" },
  { match: /snapchat/i,                                    key: "Snapchat" },
  { match: /twitter|^x$|x\.com/i,                          key: "Twitter" },
  { match: /whatsapp/i,                                    key: "WhatsApp" },
  // Website / SEO = website + SEO + ChatGPT (single organic-web channel)
  { match: /^seo$|seo\s*\/\s*organic|organic|search\s*engine\s*opt|website|web\s*direct|chatgpt|openai|^gpt$/i, key: "Website / SEO" },
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

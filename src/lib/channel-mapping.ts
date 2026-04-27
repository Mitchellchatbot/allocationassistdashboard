/**
 * Channel-name normalization shared between marketing-spend categories
 * (e.g. "Meta Ads", "LinkedIn", "SEO") and Zoho lead sources (which already
 * pass through `displaySource()` from use-zoho-data).
 *
 * Both sides go through `normalizeChannelKey()` to land on the same canonical
 * key so we can join leads and spend per channel.
 */

export type ChannelKey =
  | "Facebook" | "Instagram" | "LinkedIn" | "Google Ads" | "TikTok"
  | "YouTube"  | "Snapchat"  | "Twitter"  | "WhatsApp"   | "Website"
  | "SEO"      | "Landing Page" | "Referrals" | "Email"  | "Influencer"
  | "Print"    | "Outdoor"   | "Radio"    | "TV"         | "Events"
  | "Go Hire"  | "ChatGPT"   | "Other";

const RULES: { match: RegExp; key: ChannelKey }[] = [
  { match: /facebook|^fb$|meta\s*ads?|^meta$/i,            key: "Facebook" },
  { match: /instagram|^ig$/i,                              key: "Instagram" },
  { match: /linkedin/i,                                    key: "LinkedIn" },
  { match: /google\s*ad|adwords|sem|paid\s*search/i,       key: "Google Ads" },
  { match: /tiktok/i,                                      key: "TikTok" },
  { match: /youtube/i,                                     key: "YouTube" },
  { match: /snapchat/i,                                    key: "Snapchat" },
  { match: /twitter|^x$|x\.com/i,                          key: "Twitter" },
  { match: /whatsapp/i,                                    key: "WhatsApp" },
  { match: /^seo$|seo\s*\/\s*organic|organic|search\s*engine\s*opt/i, key: "SEO" },
  { match: /landing\s*page/i,                              key: "Landing Page" },
  { match: /website|web\s*direct/i,                        key: "Website" },
  { match: /referr|word\s*of\s*mouth/i,                    key: "Referrals" },
  { match: /email|newsletter|mailchimp/i,                  key: "Email" },
  { match: /influencer/i,                                  key: "Influencer" },
  { match: /print|magazine|newspaper/i,                    key: "Print" },
  { match: /outdoor|billboard/i,                           key: "Outdoor" },
  { match: /radio/i,                                       key: "Radio" },
  { match: /^tv$|television/i,                             key: "TV" },
  { match: /event|conference|expo/i,                       key: "Events" },
  { match: /go\s*hire|gohire/i,                            key: "Go Hire" },
  { match: /chatgpt|openai|gpt/i,                          key: "ChatGPT" },
];

export function normalizeChannelKey(raw: string | null | undefined): ChannelKey {
  if (!raw) return "Other";
  const s = raw.trim();
  if (!s) return "Other";
  for (const r of RULES) if (r.match.test(s)) return r.key;
  return "Other";
}

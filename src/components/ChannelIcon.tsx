import { Facebook, Search, Linkedin, Share2, Instagram, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const channelIconMap: Record<string, LucideIcon> = {
  // Merged channels
  "Meta":           Facebook,   // Facebook + Instagram combined
  "Website / SEO":  Globe,      // Website + SEO + ChatGPT combined
  // Other channels
  "Google Ads":     Search,
  "Google":         Search,
  "LinkedIn":       Linkedin,
  "Referrals":      Share2,
  // Legacy keys (still present in older data exports — keep so old screenshots render)
  "Facebook Ads":   Facebook,
  "Facebook":       Facebook,
  "Instagram":      Instagram,
  "Social Media":   Instagram,
  "SEO / Organic":  Globe,
  "SEO":            Globe,
  "Website":        Globe,
};

interface ChannelIconProps {
  channel: string;
  className?: string;
  size?: number;
}

export function ChannelIcon({ channel, className = "", size = 16 }: ChannelIconProps) {
  const Icon = channelIconMap[channel] || Globe;
  return (
    <div className={`inline-flex items-center justify-center rounded-md bg-primary/10 p-1.5 ${className}`}>
      <Icon className="text-primary" size={size} strokeWidth={2} />
    </div>
  );
}

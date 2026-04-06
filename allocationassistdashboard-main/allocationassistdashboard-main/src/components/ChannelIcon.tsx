import { Facebook, Search, Linkedin, Share2, Instagram, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const channelIconMap: Record<string, LucideIcon> = {
  "Facebook Ads": Facebook,
  "Facebook": Facebook,
  "Google Ads": Search,
  "Google": Search,
  "LinkedIn": Linkedin,
  "SEO / Organic": Globe,
  "SEO": Globe,
  "Referrals": Share2,
  "Social Media": Instagram,
  "Instagram": Instagram,
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

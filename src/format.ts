export const escape = (value: unknown = ''): string => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] as string));

// Extracts the video id from common YouTube URL forms so lessons can embed the
// video inline (privacy-enhanced youtube-nocookie iframe) instead of linking out.
export function parseYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?[^#]*v=([A-Za-z0-9_-]{6,})/,
    /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/,
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}
// Privacy-enhanced embed URL (youtube-nocookie). `autoplay` is only set when the
// iframe is injected after the user clicks the play overlay, never up front.
export function youtubeEmbedUrl(id: string, autoplay = false): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`);
  url.searchParams.set('rel', '0');
  if (autoplay) url.searchParams.set('autoplay', '1');
  return url.toString();
}

// Stable, always-available YouTube thumbnail (480×360). `maxresdefault` 404s for
// videos without an HD thumbnail, so `hqdefault` is the safe choice for the
// click-to-play overlay.
export function youtubeThumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

export const formatDate = (value?: string | null): string => (value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const formatMoney = (value?: number | string | null): string => (value ? `$${Number(value).toLocaleString()}` : '—');
export const CRM_STAGES = ['NEW', 'MQL', 'SQL', 'OPPORTUNITY', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST'];
export const staleLabels: Record<string, string> = { NORMAL: 'Normal', ATTENTION: 'Attention', AT_RISK: 'At risk', STALE: 'Stale', CLOSED: 'Closed' };

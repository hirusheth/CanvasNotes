// Turns links from video, audio and map services into embeddable players,
// like Milanote's Video / Audio / Map link cards.

export interface Embed {
  src: string;
  kind: 'video' | 'audio' | 'map';
  // Height as a fraction of width, or a fixed pixel height.
  ratio?: number;
  height?: number;
}

export function embedFor(raw: string): Embed | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const path = url.pathname;

  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const id = url.searchParams.get('v') || path.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    if (id) return { kind: 'video', src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: path.startsWith('/shorts') ? 16 / 9 : 9 / 16 };
  }
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (id) return { kind: 'video', src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: 9 / 16 };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = path.match(/(\d{5,})/)?.[1];
    if (id) return { kind: 'video', src: `https://player.vimeo.com/video/${id}`, ratio: 9 / 16 };
  }
  if (host === 'loom.com') {
    const id = path.match(/\/share\/(\w+)/)?.[1];
    if (id) return { kind: 'video', src: `https://www.loom.com/embed/${id}`, ratio: 9 / 16 };
  }
  if (host === 'open.spotify.com') {
    const m = path.match(/^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/);
    if (m) return { kind: 'audio', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 };
  }
  if (host === 'soundcloud.com') {
    if (path.split('/').filter(Boolean).length >= 2) {
      return { kind: 'audio', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&visual=false`, height: 166 };
    }
  }
  if ((host === 'google.com' || host.endsWith('.google.com') || host === 'maps.google.com') && (path.startsWith('/maps') || host === 'maps.google.com')) {
    const at = path.match(/@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/);
    const place = path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    const q = url.searchParams.get('q') || url.searchParams.get('query');
    const query = place ? decodeURIComponent(place.replace(/\+/g, ' ')) : q || (at ? `${at[1]},${at[2]}` : null);
    if (query) {
      const zoom = at ? Math.round(Number(at[3])) : 14;
      return { kind: 'map', src: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`, ratio: 0.75 };
    }
  }
  if (host === 'openstreetmap.org') {
    const m = url.hash.match(/map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);
    if (m) {
      const [z, lat, lon] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const d = 0.6 / 2 ** (z - 10);
      return {
        kind: 'map',
        src: `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&marker=${lat},${lon}`,
        ratio: 0.75,
      };
    }
  }
  return null;
}

export const LINK_PLACEHOLDERS: Record<string, string> = {
  video: 'Paste a link from YouTube or Vimeo',
  audio: 'Paste a link from Spotify or SoundCloud',
  map: 'Paste a link from Google Maps',
  default: 'Paste a web address…',
};

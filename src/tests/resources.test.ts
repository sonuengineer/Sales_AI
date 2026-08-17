import { describe, it, expect } from 'vitest';
import { parseYouTubeId, youtubeEmbedUrl, youtubeThumbUrl } from '../format';

describe('parseYouTubeId — inline lesson video embeds', () => {
  it('extracts the id from common YouTube URL forms', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://youtu.be/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://www.youtube.com/embed/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://www.youtube.com/shorts/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://www.youtube.com/live/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw')).toBe('jNQXAC9IVRw');
    expect(parseYouTubeId('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=30s')).toBe('jNQXAC9IVRw');
  });

  it('returns null for empty, non-YouTube or malformed urls', () => {
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeId('https://example.com/video.mp4')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?x=1')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/')).toBeNull();
  });
});

describe('video thumbnail + click-to-play embed', () => {
  it('builds the privacy-enhanced embed url without autoplay by default', () => {
    expect(youtubeEmbedUrl('jNQXAC9IVRw')).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?rel=0');
  });

  it('adds autoplay only when the iframe is injected after a click', () => {
    expect(youtubeEmbedUrl('jNQXAC9IVRw', true)).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?rel=0&autoplay=1');
  });

  it('builds the always-available hqdefault thumbnail url', () => {
    expect(youtubeThumbUrl('jNQXAC9IVRw')).toBe('https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg');
  });
});

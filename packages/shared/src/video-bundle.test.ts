import { describe, it, expect } from 'vitest';
import { parseVideoManifest, validateVideoPlaylist } from './video-bundle';

const sample = () => ({ version: 1, duration: 6, master: 'master.m3u8', fallback: 'fallback.mp4', poster: 'poster.jpg',
  renditions: [{ label: '480p', width: 480, height: 854, bandwidth: 1000000, playlist: '480p/index.m3u8' }],
  files: ['master.m3u8', 'fallback.mp4', 'poster.jpg', '480p/index.m3u8', '480p/segment_0000.ts'].map(path => ({ path, size: 100 })) });

describe('video bundle trust boundary', () => {
  it('accepts local playlists and rejects remote, traversal, encrypted and missing references', () => {
    const m = parseVideoManifest(sample());
    expect(() => validateVideoPlaylist('master.m3u8', '#EXTM3U\n480p/index.m3u8', m)).not.toThrow();
    expect(() => validateVideoPlaylist('480p/index.m3u8', '#EXTM3U\nsegment_0000.ts\n#EXT-X-ENDLIST', m)).not.toThrow();
    for (const line of ['https://evil.test/a.ts', '../fallback.mp4', '/480p/segment_0000.ts', 'missing.ts', '#EXT-X-KEY:METHOD=AES-128,URI="key"']) {
      expect(() => validateVideoPlaylist('480p/index.m3u8', `#EXTM3U\n${line}\n#EXT-X-ENDLIST`, m)).toThrow();
    }
  });
  it('rejects duplicate files, absent assets, unknown version and oversized files', () => {
    const duplicate = sample(); duplicate.files.push(duplicate.files[0]);
    expect(() => parseVideoManifest(duplicate)).toThrow();
    const missing = sample(); missing.files.shift();
    expect(() => parseVideoManifest(missing)).toThrow();
    expect(() => parseVideoManifest({ ...sample(), version: 2 })).toThrow();
    const huge = sample(); huge.files[0].size = 51 * 1024 * 1024;
    expect(() => parseVideoManifest(huge)).toThrow();
  });
});

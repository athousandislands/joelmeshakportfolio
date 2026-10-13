import manifest from './media-manifest.json';

export function imageUrl(src, cssWidth, dpr = 1) {
    const entry = manifest.images[src];
    if (!entry?.v.length) return src;
    const needed = Math.ceil(cssWidth * dpr);
    if (needed >= entry.w) return src;
    const width = entry.v.find(width => width >= needed) || entry.v.at(-1);
    return `assets/_derived/${src.replace(/\.[^.]+$/, '')}-${width}.webp`;
}
export const videoPoster = src => manifest.videos[src]?.poster || '';
export const mobileVideo = src => manifest.videos[src]?.mobile || src;
export { manifest };

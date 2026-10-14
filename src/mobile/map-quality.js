// Frame-rate caps (including iOS power saving) are not proof of GPU overload.
export function createMapQuality(deviceRatio) {
    const ceiling = Math.min(2, Math.max(1, deviceRatio || 1));
    const floor = Math.min(1.2, ceiling);
    let ratio = ceiling, slow = 0, healthy = 0;
    return {
        get ratio() { return ratio; },
        sample(fps) {
            slow = fps < 24 ? slow + 1 : 0;
            healthy = fps > 52 ? healthy + 1 : 0;
            if (slow >= 2) { ratio = Math.max(floor, ratio - .25); slow = healthy = 0; }
            else if (healthy >= 4) { ratio = Math.min(ceiling, ratio + .25); slow = healthy = 0; }
            return ratio;
        },
        reset() { slow = healthy = 0; },
    };
}

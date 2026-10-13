    const DPR_CAP = 1.5;
    const GOVERNOR_GRACE_S = 4.0;

export function createGovernor({ V, Router, clamp }) {
    const Governor = (() => {
        const consumers = new Map();   // key -> { apply, scene, dirty }
        const samples = new Float32Array(60);
        let n = 0, filled = false;
        let quality = 1.0;             // 0.6 .. 1.0, monotonically non-increasing
        let lastChange = -Infinity;
        let badStreak = 0;
        let lastSampleWindow = -Infinity;

        function ratioFor() {
            return clamp(Math.min(V.dpr, DPR_CAP) * quality, 1.0, DPR_CAP);
        }

        function applyActive() {
            const r = ratioFor();
            consumers.forEach((c) => {
                if (c.scene === Router.scene) { c.dirty = false; c.apply(r); }
                else c.dirty = true;
            });
        }

        function p95() {
            const len = filled ? samples.length : n;
            if (len < 40) return 0;
            const copy = Array.prototype.slice.call(samples, 0, len).sort((a, b) => a - b);
            return copy[Math.floor(len * 0.95)];
        }

        return {
            register(key, scene, apply) {
                consumers.set(key, { apply, scene, dirty: false });
                apply(ratioFor());
            },
            unregister(key) { consumers.delete(key); },
            /* Called when a scene becomes visible, so a renderer that was skipped
               while hidden picks up the current quality without a mid-scene resize. */
            refresh(key) {
                const c = consumers.get(key);
                if (c && c.dirty) { c.dirty = false; c.apply(ratioFor()); }
            },
            ratioFor,
            sample(dt, time) {
                /* FIX 2: the boot window is slow by nature (PMREM, shader compile,
                   first image decodes). Judging it produces false positives. */
                if (time < GOVERNOR_GRACE_S) return;

                samples[n++] = dt * 1000;
                if (n >= samples.length) { n = 0; filled = true; }
                if (time - lastChange < 2.0 || time - lastSampleWindow < 1.0) return;
                lastSampleWindow = time;

                const worst = p95();
                if (worst === 0) return;

                if (worst > 22) {
                    badStreak += 1;
                    if (badStreak >= 3 && quality > 0.6) {
                        quality = Math.max(0.6, quality - 0.15);
                        lastChange = time;
                        badStreak = 0;
                        console.info('[governor] quality ->', quality.toFixed(2), 'p95', worst.toFixed(1) + 'ms');
                        applyActive();
                    }
                } else {
                    badStreak = 0;
                }
            },
            get quality() { return quality; }
        };
    })();
    return Governor;
}

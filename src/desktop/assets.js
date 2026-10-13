import { imageUrl, manifest } from '../shared/media.js';

export function createAssets({ V, DPR_CAP, Idle, allProjectsData, buildMediaData }) {
    const ASSET_MANIFEST = manifest.images;

    const Assets = (() => {
        const dims = new Map();
        const listeners = new Set();
        const requested = new Set();
        const decoded = new Set();
        let controller = new AbortController();
        let generation = 0;

        function urlFor(src, displayCssPx) {
            return imageUrl(src, displayCssPx || 0, Math.min(V.dpr, DPR_CAP));
        }

        function setDims(src, w, h) {
            if (!w || !h) return;
            const prev = dims.get(src);
            if (prev && prev.w === w && prev.h === h) return;
            dims.set(src, { w, h, aspect: w / h });
            listeners.forEach(fn => fn(src));
        }

        Object.keys(ASSET_MANIFEST).forEach(src => {
            const e = ASSET_MANIFEST[src];
            if (e && e.w && e.h) dims.set(src, { w: e.w, h: e.h, aspect: e.w / e.h });
        });

        function allowBackfill() {
            const c = navigator.connection;
            if (!c) return true;
            if (c.saveData) return false;
            return !/(^|-)2g$/.test(c.effectiveType || '');
        }

        function warm(src, { decode = false, priority = 'low', displayPx = 0 } = {}) {
            const url = urlFor(src, displayPx);
            if (requested.has(url) && (!decode || decoded.has(url))) return Promise.resolve();
            requested.add(url);

            const img = new Image();
            if ('fetchPriority' in img) img.fetchPriority = priority;
            img.decoding = 'async';

            const signal = controller.signal;
            const done = new Promise(resolve => {
                let settled = false;
                function finish() {
                    if (settled) return;
                    settled = true;
                    signal.removeEventListener('abort', abort);
                    resolve();
                }
                function abort() {
                    img.onload = img.onerror = null;
                    img.removeAttribute('src');
                    requested.delete(url);
                    finish();
                }
                img.onload = () => {
                    if (signal.aborted) return abort();
                    setDims(src, img.naturalWidth, img.naturalHeight);
                    if (decode && img.decode) {
                        img.decode().then(() => { if (!signal.aborted) decoded.add(url); }).catch(() => {}).finally(finish);
                    } else finish();
                };
                img.onerror = () => { requested.delete(url); finish(); };
                signal.addEventListener('abort', abort, { once: true });
                img.src = url;
            });
            return done;
        }

        /* Serialised queue, now driven by the real idle scheduler (FIX 8). */
        const queue = [];
        let draining = false;
        function drain() {
            if (draining) return;
            draining = true;
            const batchGeneration = generation;
            const step = () => {
                if (batchGeneration !== generation) return;
                if (!queue.length) { draining = false; return; }
                queue.sort((a, b) => a.tier - b.tier);
                const batch = queue.splice(0, 3).map(job => warm(job.src, job.opts));
                Promise.all(batch).then(() => Idle.run(step));
            };
            Idle.run(step);
        }
        function enqueue(src, tier, opts) {
            if (requested.has(urlFor(src, opts && opts.displayPx))) return;
            queue.push({ src, tier, opts: opts || {} });
            drain();
        }

        const projectImages = (i) => {
            const out = [];
            buildMediaData(allProjectsData[i]).forEach(cl => {
                cl.assets.forEach(a => { if (a.type === 'img') out.push(a.src); });
            });
            return out;
        };

        const prefetchedProjects = new Set();

        return {
            urlFor,
            get: (src) => dims.get(src) || null,
            setDims,
            onResolve(fn) { listeners.add(fn); },
            get signal() { return controller.signal; },

            /* Drop everything still queued. Called on scene transitions so an
               abandoned project stops competing for bandwidth and decode time. */
            cancelPending() {
                generation++;
                queue.length = 0;
                draining = false;
                prefetchedProjects.clear();
                controller.abort();
                controller = new AbortController();
            },

            warmCovers() {
                allProjectsData.forEach((p) => {
                    const first = buildMediaData(p)[0];
                    if (!first) return;
                    /* FIX (startup): only the FIRST cover per project is decoded
                       eagerly now, not three. A decoded large image is ~12MB of
                       short-lived RAM; twelve of them at t=1.5s produced an
                       allocate-then-collect spike that showed up as a stutter. */
                    first.assets.slice(0, 3).forEach((a, idx) => {
                        if (a.type === 'img') {
                            enqueue(a.src, 1, { decode: idx === 0, priority: 'low', displayPx: 400 });
                        }
                    });
                });
            },

            prefetchProject(i) {
                if (i === 99 || prefetchedProjects.has(i)) return;
                prefetchedProjects.add(i);
                projectImages(i).forEach(src => enqueue(src, 2, { priority: 'high', displayPx: 800 }));
            },

            backfill() {
                if (!allowBackfill()) return;
                allProjectsData.forEach((_, i) => {
                    projectImages(i).forEach(src => enqueue(src, 3, { priority: 'low', displayPx: 800 }));
                });
            }
        };
    })();
    return Assets;
}

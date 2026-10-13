import { createMapSession } from './mind-map-controller.js';

// A regular dotted sphere, projected as a tiny SVG in the existing icon colour.
export function dottedSphereIcon() {
    const dots = [];
    for (let row = -2; row <= 2; row++) {
        const latitude = row * Math.PI / 6;
        for (let column = 0; column < 12; column++) {
            const longitude = column * Math.PI / 6;
            const depth = Math.cos(latitude) * Math.cos(longitude);
            if (depth < -0.01) continue;
            const x = 12 + 8.4 * Math.cos(latitude) * Math.sin(longitude);
            const y = 12 + 8.4 * Math.sin(latitude);
            dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(0.62 + depth * 0.19).toFixed(2)}" opacity="${(0.55 + depth * 0.45).toFixed(2)}"/>`);
        }
    }
    dots.push('<circle cx="12" cy="3.6" r=".62"/><circle cx="12" cy="20.4" r=".62"/>');
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${dots.join('')}</svg>`;
}

export function createMindMapUI({ reduced }) {
    const button = document.getElementById('nav-mindmap-btn');
    const stage = document.getElementById('mobile-mindmap-stage');
    const loading = document.getElementById('mobile-mindmap-loading');
    const errorPanel = document.getElementById('mobile-mindmap-error');
    const intro = document.getElementById('mobile-mindmap-intro');
    const hint = document.getElementById('mobile-mindmap-hint');
    const SEEN_KEY = 'portfolio-mobile-mindmap-intro-seen';
    let introSeen = false, readyAt = 0, engaged = false;
    const timers = new Set();
    try { introSeen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
    button.innerHTML = dottedSphereIcon();
    function later(fn, ms) {
        const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
        timers.add(timer);
    }
    function resetCopy() {
        timers.forEach(clearTimeout); timers.clear();
        for (const element of [intro, hint]) { element.hidden = true; element.classList.remove('shown'); }
        engaged = false; readyAt = 0;
    }
    function show(element) {
        element.hidden = false;
        element.setAttribute('aria-hidden', 'false');
        // Flush its hidden state before the opacity transition begins.
        void element.offsetWidth;
        element.classList.add('shown');
    }
    function hide(element) { element.classList.remove('shown'); element.setAttribute('aria-hidden', 'true'); }
    function ready() {
        readyAt = performance.now();
        show(hint);
        if (!introSeen) {
            show(intro); introSeen = true;
            try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
            later(() => hide(intro), 6000);
        }
    }
    function engage() {
        if (engaged || !readyAt) return;
        engaged = true;
        hide(hint);
        later(() => hide(intro), Math.max(0, 3000 - (performance.now() - readyAt)));
    }
    const session = createMapSession({
        load: () => import('./mind-map.js'),
        create: (module, tileCount) => module.createMobileMap({ stage, loading, tileCount, reduced, onReady: ready, onEngage: engage,
            onError: error => queueMicrotask(() => {
                if (!session.active) return;
                session.leave(); showError(error);
            }),
        }),
        onLoading(count) {
            resetCopy(); errorPanel.hidden = true; loading.style.opacity = '1'; loading.setAttribute('aria-hidden', 'false');
            stage.dataset.state = 'loading'; stage.setAttribute('aria-busy', 'true');
            document.getElementById('mobile-mindmap-lite').hidden = count === 32;
        },
        onError: showError,
    });
    function showError(error) {
        resetCopy(); loading.style.opacity = '0'; loading.setAttribute('aria-hidden', 'true');
        errorPanel.hidden = false; stage.dataset.state = 'error'; stage.setAttribute('aria-busy', 'false');
        console.info('[mobile mind map] Could not open:', error.message);
    }
    // Watch the scene's completed reveal without running another render loop.
    new MutationObserver(() => {
        if (stage.dataset.ready === 'true') { stage.dataset.state = 'ready'; stage.setAttribute('aria-busy', 'false'); }
    }).observe(stage, { attributes: true, attributeFilter: ['data-ready'] });
    document.getElementById('mobile-mindmap-retry').addEventListener('click', () => session.enter());
    document.getElementById('mobile-mindmap-lite').addEventListener('click', () => session.enter(32));
    return {
        enter() { button.setAttribute('aria-pressed', 'true'); session.enter(); },
        leave() { button.setAttribute('aria-pressed', 'false'); session.leave(); resetCopy(); stage.setAttribute('aria-busy', 'false'); },
        reveal() { button.classList.add('in'); },
    };
}

import { createMindMapDiscovery } from './mind-map-discovery.js';
import { createMapSession } from './mind-map-controller.js';
import { createMapLoading } from './map-loading.js';

// Equal-weight dots: one centre with six evenly spaced around it.
export function mindMapIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="12" r="2.1"/><g class="mindmap-orbit-dots"><circle cx="12" cy="4.6" r="2.1"/><circle cx="18.41" cy="8.3" r="2.1"/><circle cx="18.41" cy="15.7" r="2.1"/><circle cx="12" cy="19.4" r="2.1"/><circle cx="5.59" cy="15.7" r="2.1"/><circle cx="5.59" cy="8.3" r="2.1"/></g></svg>';
}

export function createMindMapUI({ reduced }) {
    const button = document.getElementById('nav-mindmap-btn');
    const stage = document.getElementById('mobile-mindmap-stage');
    const loading = document.getElementById('mobile-mindmap-loading');
    const errorPanel = document.getElementById('mobile-mindmap-error');
    const intro = document.getElementById('mobile-mindmap-intro');
    const hint = document.getElementById('mobile-mindmap-hint');
    const loader = createMapLoading({ root: loading, reduced,
        track: document.getElementById('mindmap-loading-fill'),
        number: document.getElementById('mindmap-loading-number'),
        copy: document.getElementById('mindmap-loading-copy'),
    });
    let readyAt = 0, engaged = false, disposed = false;
    const timers = new Set();
    button.innerHTML = mindMapIcon();
    let discoveryStorage;
    try { discoveryStorage = window.localStorage; } catch {}
    const discovery = createMindMapDiscovery({
        button, storage: discoveryStorage, reduced,
        eligible: () => document.getElementById('mobile-root').dataset.page !== 'gallery',
    });
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
        show(intro);
        later(() => hide(intro), 6000);
    }
    function engage() {
        if (engaged || !readyAt) return;
        engaged = true;
        hide(hint);
        later(() => hide(intro), Math.max(0, 3000 - (performance.now() - readyAt)));
    }
    const session = createMapSession({
        load: () => import('./mind-map.js'),
        create: (module, tileCount, report) => {
            loader.reset(); if (session.active) loader.start();
            return module.createMobileMap({ stage, loading, tileCount, reduced,
            onReady() { loader.complete(); if (session.active) ready(); }, onEngage: engage, onProgress: loader.progress,
            onError: error => queueMicrotask(() => report(error)),
        }); },
        onLoading(count) {
            resetCopy(); errorPanel.hidden = true; loader.start();
            stage.dataset.state = 'loading'; stage.setAttribute('aria-busy', 'true');
            document.getElementById('mobile-mindmap-lite').hidden = count === 32;
        },
        onResume() {
            resetCopy(); errorPanel.hidden = true;
            const complete = stage.dataset.ready === 'true';
            stage.setAttribute('aria-busy', String(!complete));
            if (complete) ready(); else loader.start();
        },
        onError: showError,
    });
    function showError(error) {
        resetCopy(); loader.reset(); loading.style.opacity = '0'; loading.setAttribute('aria-hidden', 'true');
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
        prepare() { if (!disposed) session.prepare(); },
        enter() { button.setAttribute('aria-pressed', 'true'); session.enter(); },
        leave() { loader.stop(); button.setAttribute('aria-pressed', 'false'); session.leave(); resetCopy(); stage.setAttribute('aria-busy', 'false'); },
        dispose() { disposed = true; loader.reset(); discovery.stop(); button.setAttribute('aria-pressed', 'false'); session.dispose(); resetCopy(); stage.setAttribute('aria-busy', 'false'); },
        reveal() { button.classList.add('in'); discovery.enter(); },
        discover() { discovery.enter(); },
    };
}

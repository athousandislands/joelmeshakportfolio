import { createMapSession } from './mind-map-controller.js';

// Four open, spaced dots: one centre and three forming a triangle around it.
export function mindMapIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="4.7" r="2"/><circle cx="4.8" cy="17.2" r="2"/><circle cx="19.2" cy="17.2" r="2"/><circle cx="12" cy="12.7" r="2"/></svg>';
}

export function createMindMapUI({ reduced }) {
    const button = document.getElementById('nav-mindmap-btn');
    const stage = document.getElementById('mobile-mindmap-stage');
    const loading = document.getElementById('mobile-mindmap-loading');
    const errorPanel = document.getElementById('mobile-mindmap-error');
    const intro = document.getElementById('mobile-mindmap-intro');
    const hint = document.getElementById('mobile-mindmap-hint');
    let readyAt = 0, engaged = false;
    const timers = new Set();
    button.innerHTML = mindMapIcon();
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
        create: (module, tileCount, report) => module.createMobileMap({ stage, loading, tileCount, reduced, onReady: ready, onEngage: engage,
            onError: error => queueMicrotask(() => report(error)),
        }),
        onLoading(count) {
            resetCopy(); errorPanel.hidden = true; loading.style.opacity = '1'; loading.setAttribute('aria-hidden', 'false');
            stage.dataset.state = 'loading'; stage.setAttribute('aria-busy', 'true');
            document.getElementById('mobile-mindmap-lite').hidden = count === 32;
        },
        onResume() {
            resetCopy(); errorPanel.hidden = true;
            const complete = stage.dataset.ready === 'true';
            stage.setAttribute('aria-busy', String(!complete));
            if (complete) ready();
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
        dispose() { button.setAttribute('aria-pressed', 'false'); session.dispose(); resetCopy(); stage.setAttribute('aria-busy', 'false'); },
        reveal() { button.classList.add('in'); },
    };
}

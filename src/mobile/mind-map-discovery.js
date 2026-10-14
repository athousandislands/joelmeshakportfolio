const VISITS_KEY = 'portfolio-mobile-mindmap-discovery-v2-visits';

export function createMindMapDiscovery({ button, storage, reduced, eligible }) {
    let visits = 0;
    try { visits = Math.min(3, Math.max(0, Math.floor(Number(storage?.getItem(VISITS_KEY)) || 0))); } catch {}
    const stop = () => button.classList.remove('mindmap-discover');
    button.addEventListener('animationend', stop);
    return {
        enter() {
            stop();
            if (reduced || !eligible() || visits >= 3) return false;
            visits++;
            try { storage?.setItem(VISITS_KEY, String(visits)); } catch {}
            button.classList.add('mindmap-discover');
            return true;
        },
        stop,
        dispose() { stop(); button.removeEventListener('animationend', stop); },
    };
}

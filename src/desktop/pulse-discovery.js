const VISITS_KEY = 'portfolio-pulse-discovery-visits';

// Count scene entries, never mousemove reveals. Storage failure falls back to
// the current page; the cue is purely visual and does not change Pulse state.
export function createPulseDiscovery({ label, storage, reduced }) {
    let visits = 0;
    try { visits = Math.min(3, Math.max(0, Math.floor(Number(storage?.getItem(VISITS_KEY)) || 0))); } catch {}
    const stop = () => label.classList.remove('pulse-discover');
    label.addEventListener('animationend', stop);
    return {
        enter() {
            stop();
            if (reduced || visits >= 3) return false;
            visits++;
            try { storage?.setItem(VISITS_KEY, String(visits)); } catch {}
            label.classList.add('pulse-discover');
            return true;
        },
        stop,
        dispose() { stop(); label.removeEventListener('animationend', stop); },
    };
}

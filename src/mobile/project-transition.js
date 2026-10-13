// One cancellable sequence owns image changes and their UI updates.
export function createProjectTransition({ prepare, hide, commit, reveal, restore, onError = () => {}, duration = 180 }) {
    let current = null;
    function cancel() {
        current?.abort();
        current = null;
        restore();
    }
    function pause(signal) {
        return new Promise((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
            const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, duration);
            signal.addEventListener('abort', abort, { once: true });
        });
    }
    async function request(value, { instant = false } = {}) {
        cancel();
        const controller = new AbortController();
        current = controller;
        const signal = controller.signal;
        const aborted = new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        try {
            await Promise.race([Promise.resolve().then(() => prepare(value)), aborted]);
            if (signal.aborted) return;
            if (instant) { commit(value, true); return; }
            hide();
            await pause(signal);
            if (signal.aborted) return;
            commit(value, false);
            reveal();
            await pause(signal);
        } catch (error) {
            if (!signal.aborted) onError(error);
        } finally {
            if (current === controller) { current = null; restore(); }
        }
    }
    return { request, cancel, get busy() { return current !== null; } };
}

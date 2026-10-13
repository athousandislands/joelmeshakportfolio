// Speculative work may be skipped; an explicit visit always gets another chance.
export function createPreparation({ allowed, prepare, onError = () => {} }) {
    let pending = null, complete = false, controller = null, generation = 0;
    function cancel() {
        generation++;
        controller?.abort();
        controller = null;
        pending = null;
        complete = false;
    }
    function start({ force = false } = {}) {
        if (pending) return pending;
        if (complete || (!force && !allowed())) return Promise.resolve();
        const id = ++generation;
        controller = new AbortController();
        const signal = controller.signal;
        const abort = new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
        pending = Promise.race([Promise.resolve().then(() => prepare(signal)), abort])
            .then(() => { if (id === generation) complete = true; })
            .catch(error => { if (error.name !== 'AbortError') onError(error); })
            .finally(() => { if (id === generation) { pending = null; controller = null; } });
        return pending;
    }
    return { start, cancel };
}

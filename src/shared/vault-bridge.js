export const VaultBridge = (() => {
    /* Three states, not a single flag: pending/ready/failed — 'failed'
       reached via initDesktop(Homepage).catch(). onSettle() covers both
       outcomes with one queue regardless of which resolves first. */
    let state = 'pending';
    let enterFn = null;
    let failReason = null;
    let queue = [];
    function flush() { const q = queue; queue = []; q.forEach(cb => cb()); }
    return {
        get ready() { return state === 'ready'; },
        get failed() { return state === 'failed'; },
        get failReason() { return failReason; },
        onSettle(cb) { if (state !== 'pending') cb(); else queue.push(cb); },
        markReady(fn) { if (state !== 'pending') return; enterFn = fn; state = 'ready'; flush(); },
        /* Only the FIRST failure counts. Once WebGL is confirmed unavailable
           for this session it stays that way — nothing here retries init. */
        fail(reason) { if (state !== 'pending') return; state = 'failed'; failReason = reason; flush(); },
        enter() { if (enterFn) enterFn(); }
    };
})();


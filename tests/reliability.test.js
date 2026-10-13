import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraSession, canAdvanceAlignment } from '../src/shared/camera-session.js';
import { createPreparation } from '../src/shared/preparation.js';
import { createGovernor } from '../src/desktop/governor.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function camera(options = {}) {
    let stopped = 0;
    const stream = { getTracks: () => [{ stop: () => stopped++ }] };
    const manager = createCameraSession({ getUserMedia: async () => stream, attachVideo: () => {}, playVideo: async () => {}, loadModel: async () => {}, ...options });
    return { manager, stream, stopped: () => stopped };
}
test('alignment remains visible four seconds and still requires a current held pinch', () => {
    const input = { shownAt: 100, pinchSince: 200, pinching: true };
    assert.equal(canAdvanceAlignment({ ...input, now: 4099 }), false);
    assert.equal(canAdvanceAlignment({ ...input, now: 4100 }), true);
    assert.equal(canAdvanceAlignment({ ...input, now: 6000, pinching: false }), false);
    assert.equal(canAdvanceAlignment({ ...input, now: 6000, pinchSince: 5900 }), false);
});
test('camera returned after leaving is stopped and never attached', async () => {
    const pending = deferred();
    let attached = 0;
    const item = camera({ getUserMedia: () => pending.promise, attachVideo: stream => { if (stream) attached++; } });
    const start = item.manager.start();
    const rejection = assert.rejects(start, /cancelled/);
    await Promise.resolve();
    item.manager.cancel();
    pending.resolve(item.stream);
    await rejection;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(item.stopped(), 1);
    assert.equal(attached, 0);
});
test('model failure releases camera and a retry can succeed', async () => {
    let fail = true;
    const item = camera({ loadModel: async () => { if (fail) throw new Error('network'); } });
    await assert.rejects(item.manager.start(), /network/);
    assert.equal(item.stopped(), 1);
    fail = false;
    assert.equal(await item.manager.start(), true);
    item.manager.cancel();
    assert.equal(item.stopped(), 2);
});
test('stalled tracking times out and releases camera', async () => {
    const item = camera({ loadModel: () => new Promise(() => {}), modelTimeout: 10 });
    await assert.rejects(item.manager.start(), /timed out/);
    assert.equal(item.stopped(), 1);
});
test('cancel during model loading cannot revive a session', async () => {
    const pending = deferred();
    const item = camera({ loadModel: () => pending.promise });
    const result = item.manager.start();
    const rejection = assert.rejects(result, /cancelled/);
    await new Promise(resolve => setImmediate(resolve));
    item.manager.cancel();
    pending.resolve();
    await rejection;
    assert.equal(item.stopped(), 1);
});
test('Save-Data skips speculation but explicit entry loads', async () => {
    let calls = 0;
    const preparation = createPreparation({ allowed: () => false, prepare: async () => { calls++; } });
    await preparation.start();
    assert.equal(calls, 0);
    await preparation.start({ force: true });
    assert.equal(calls, 1);
});
test('cancelled preparation can restart and concurrent entries share a task', async () => {
    let signal, calls = 0;
    const pending = deferred();
    const preparation = createPreparation({ allowed: () => true, prepare: value => { signal = value; calls++; return calls === 1 ? pending.promise : Promise.resolve(); } });
    const first = preparation.start();
    assert.equal(first, preparation.start({ force: true }));
    await Promise.resolve();
    preparation.cancel();
    assert.equal(signal.aborted, true);
    await first;
    await preparation.start({ force: true });
    pending.resolve();
    assert.equal(calls, 2);
});
test('governor requires three bad measurement windows, not three frames', () => {
    const governor = createGovernor({ V: { dpr: 2 }, Router: { scene: 1 }, clamp: (x,a,b) => Math.max(a, Math.min(b,x)) });
    for (let i = 0; i < 180; i++) governor.sample(0.04, 4 + i / 60);
    assert.equal(governor.quality, 1);
    governor.sample(0.04, 7.01);
    assert.equal(governor.quality, 0.85);
    assert.ok(governor.ratioFor() >= 1 && governor.ratioFor() <= 1.5);
});

test('camera permission timeout also stops a stream returned much later', async () => {
    const pending = deferred();
    const item = camera({ getUserMedia: () => pending.promise, cameraTimeout: 10 });
    await assert.rejects(item.manager.start(), /timed out/);
    pending.resolve(item.stream);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(item.stopped(), 1);
});

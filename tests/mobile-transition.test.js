import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTransition } from '../src/mobile/project-transition.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
    const events = [];
    const transition = createProjectTransition({
        duration: 5,
        prepare: async value => { events.push(['ready', value]); },
        hide: () => events.push(['hide']),
        commit: (value, instant) => events.push(['commit', value, instant]),
        reveal: () => events.push(['reveal']),
        restore: () => events.push(['restore']),
        onError: error => events.push(['error', error.message]),
        ...options,
    });
    return { transition, events };
}

test('project image, caption and selection share a single commit between fade phases', async () => {
    const { transition, events } = setup();
    await transition.request(38);
    assert.deepEqual(events, [['restore'], ['ready',38], ['hide'], ['commit',38,false], ['reveal'], ['restore']]);
    assert.equal(transition.busy, false);
});

test('destination readiness is required before hiding the current image', async () => {
    const ready = deferred();
    const { transition, events } = setup({ prepare: () => ready.promise });
    const request = transition.request(14);
    await tick();
    assert.deepEqual(events, [['restore']]);
    ready.resolve();
    await request;
    assert.ok(events.some(event => event[0] === 'commit'));
});

test('a touch cancels a pending project change with no later scroll or caption write', async () => {
    const ready = deferred();
    const { transition, events } = setup({ prepare: () => ready.promise });
    const request = transition.request(24);
    await tick();
    transition.cancel();
    ready.resolve();
    await request;
    assert.equal(events.filter(event => event[0] === 'commit').length, 0);
    assert.equal(transition.busy, false);
    assert.equal(events.at(-1)[0], 'restore');
});

test('interruption during fade-out restores control without changing the image', async () => {
    const hidden = deferred();
    const { transition, events } = setup({ duration: 100, hide: () => hidden.resolve() });
    const request = transition.request(14);
    await hidden.promise;
    transition.cancel();
    await request;
    assert.equal(events.filter(event => event[0] === 'commit').length, 0);
});

test('rapid selections commit only the newest project', async () => {
    const firstReady = deferred();
    const { transition, events } = setup({ prepare: value => value === 14 ? firstReady.promise : Promise.resolve() });
    const first = transition.request(14);
    await tick();
    const latest = transition.request(38);
    firstReady.resolve();
    await Promise.all([first, latest]);
    assert.deepEqual(events.filter(event => event[0] === 'commit'), [['commit',38,false]]);
});

test('reduced motion/hidden entry commits ready artwork without a fade', async () => {
    const { transition, events } = setup();
    await transition.request(0, { instant: true });
    assert.deepEqual(events, [['restore'], ['ready',0], ['commit',0,true], ['restore']]);
});

test('failed artwork leaves the current image in place and permits another request', async () => {
    const { transition, events } = setup({ prepare: value => value === 14 ? Promise.reject(new Error('image unavailable')) : Promise.resolve() });
    await transition.request(14);
    assert.equal(events.filter(event => event[0] === 'commit').length, 0);
    await transition.request(24);
    assert.deepEqual(events.filter(event => event[0] === 'commit'), [['commit',24,false]]);
});

test('cancelling the reveal keeps the already committed image and cancels stale cleanup', async () => {
    const revealed = deferred();
    const { transition, events } = setup({ duration: 10, reveal: () => { events.push(['reveal']); revealed.resolve(); } });
    const first = transition.request(14);
    await revealed.promise;
    transition.cancel();
    const second = transition.request(38, { instant: true });
    await Promise.all([first, second]);
    assert.deepEqual(events.filter(event => event[0] === 'commit'), [['commit',14,false], ['commit',38,true]]);
    assert.equal(transition.busy, false);
});

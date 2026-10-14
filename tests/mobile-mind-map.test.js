import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapSession } from '../src/mobile/mind-map-controller.js';
import { mindMapIcon } from '../src/mobile/mind-map-ui.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function setup(load = async () => ({}), start = () => {}, resume = () => {}) {
    const events = [], faults = [];
    const session = createMapSession({ load,
        create(module, count, report) { faults.push(report); events.push(['create',count]); return { start() { events.push(['start']); start(); }, pause() { events.push(['pause']); }, resume() { events.push(['resume']); resume(); }, dispose() { events.push(['dispose']); } }; },
        onResume: () => events.push(['return']), onLoading: count => events.push(['loading',count]), onError: error => events.push(['error',error.message]),
    });
    return {session,events,faults};
}
test('leaving while graphics code loads never creates a background map', async () => {
    const load = deferred(); const {session,events} = setup(() => load.promise);
    const pending = session.enter(); session.leave(); load.resolve({}); await pending;
    assert.deepEqual(events, [['loading',55]]); assert.equal(session.active,false);
});
test('repeated entries during loading mount only the newest map', async () => {
    const load = deferred(); const {session,events} = setup(() => load.promise);
    const first = session.enter(76), second = session.enter(32); load.resolve({}); await Promise.all([first,second]);
    assert.deepEqual(events, [['loading',76],['loading',32],['create',32],['start']]);
});
test('returning reuses the prepared scene and fallback selection without loading again', async () => {
    const {session,events} = setup(); await session.enter(32); session.leave(); session.leave(); await session.enter();
    assert.deepEqual(events, [['loading',32],['create',32],['start'],['pause'],['return'],['resume']]);
    session.dispose(); session.dispose();
    assert.equal(events.filter(e => e[0] === 'dispose').length,1);
});
test('changing image count disposes the old cache before creating its replacement', async () => {
    const {session,events} = setup(); await session.enter(); session.leave(); await session.enter(32);
    assert.deepEqual(events.filter(e => ['create','dispose'].includes(e[0])), [['create',55],['dispose'],['create',32]]);
});
test('a cached scene failing while paused is released silently and can load again', async () => {
    const {session,events,faults} = setup(); await session.enter(); session.leave(); faults[0](new Error('context lost'));
    assert.equal(events.at(-1)[0], 'dispose'); assert.equal(events.filter(e => e[0] === 'error').length,0);
    await session.enter(); assert.equal(events.filter(e => e[0] === 'create').length,2);
});
test('late failure from a replaced scene cannot dispose the new scene', async () => {
    const {session,events,faults} = setup(); await session.enter(); await session.enter(32);
    const before = events.length; faults[0](new Error('old context')); assert.equal(events.length,before); assert.equal(session.active,true);
});
test('graphics startup failure disposes partial resources and permits a retry', async () => {
    let attempts = 0; const {session,events} = setup(undefined, () => { if (++attempts === 1) throw new Error('unavailable'); });
    await session.enter(); assert.deepEqual(events.slice(-2), [['dispose'],['error','unavailable']]);
    await session.enter(32); assert.equal(events.at(-1)[0],'start');
});
test('failure on resume releases the retained scene and offers a fresh retry', async () => {
    const {session,events} = setup(undefined, undefined, () => { throw new Error('resume failed'); });
    await session.enter(); session.leave(); await session.enter();
    assert.deepEqual(events.slice(-2), [['dispose'],['error','resume failed']]);
    assert.equal(session.active,false);
    await session.enter(); assert.equal(events.at(-1)[0], 'start');
});
test('a stale import failure after navigation does not replace the new screen with an error', async () => {
    const load = deferred(); const {session,events} = setup(() => load.promise);
    const pending = session.enter(); session.leave(); load.reject(new Error('offline')); await pending;
    assert.deepEqual(events,[['loading',55]]);
});
test('Mind Map icon uses a centre dot and six surrounding dots with inherited colour and no visible label', () => {
    const svg = mindMapIcon(); assert.match(svg,/fill="currentColor"/); assert.doesNotMatch(svg,/<text/);
    assert.equal((svg.match(/<circle /g)||[]).length, 7);
});

// Exercise the shared scene with real Three geometry and simulated texture/GPU
// completion: every tile must finish uploading before a strict mobile reveal.
import * as THREE from 'three';
import { createMindMap } from '../src/desktop/mind-map.js';
function sceneSetup(t, count, fail = false, options = {}) {
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true });
    t.after(() => { globalThis.fetch = fetchBefore; });
    const requested = [], uploads = [], errors = [], renders = [];
    let frame, controls, camera, globe, ready = 0;
    class Renderer {
        constructor() { this.domElement = {style:{},parentNode:null}; this.capabilities = {getMaxAnisotropy:() => 1}; }
        setSize() {} setPixelRatio() {} dispose() {} getContext() { return {getExtension:() => null}; }
        initTexture(texture) { uploads.push(texture); }
        render(scene, currentCamera) { camera = currentCamera; globe = scene.children[0]; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); renders.push(globe.visible); }
    }
    class Controls { constructor() { controls = this; this.minPolarAngle = 0; this.maxPolarAngle = Math.PI; this.touches = {}; this.mouseButtons = {}; } update() {} dispose() {} }
    class Loader {
        setTranscoderPath() { return this; } detectSupport() { return this; } setWorkerLimit() {} dispose() {}
        async loadAsync(path) { requested.push(path); if (fail) throw new Error('offline'); return new THREE.Texture(); }
    }
    const element = {style:{},setAttribute(){},appendChild(){}};
    const scene = createMindMap({
        THREE:{...THREE, WebGLRenderer:Renderer}, OrbitControls:Controls, KTX2Loader:Loader,
        V:{width:390,height:550,aspect:390/550,t:0,onChange:() => () => {}}, renderer:null,
        Governor:{ratioFor:() => 1,register(){},unregister(){}},
        guardContext:() => ({markDisposing(){},destroy(){}}), Idle:{run:fn => fn()},
        Loop:{register(key,fn){frame=fn;}}, REDUCED_MOTION:true, gsap:{},
        clamp:(v,a,b) => Math.max(a,Math.min(b,v)), mix:(a,b,t) => a+(b-a)*t,
    },{...options,container:element,loading:element,tileCount:count,strictReady:true,onReady:() => ready++,onError:e => errors.push(e)});
    t.after(() => scene.dispose());
    return {scene,frame,requested,uploads,errors,renders,get controls(){return controls;},get camera(){return camera;},get globe(){return globe;},get ready(){return ready;}};
}
for (const count of [76,55,32]) {
    test(`the ${count}-image map reveals only after every real tile is uploaded`, async t => {
        const view = sceneSetup(t,count); view.scene.mount(); await view.scene.prewarm({force:true});
        assert.equal(view.scene.tileCount,count); assert.equal(view.requested.length,count);
        assert.equal(new Set(view.requested).size,count);
        view.frame(1/60,1); assert.equal(view.ready,0); assert.equal(view.renders.at(-1),false);
        for(let i=0;i<count;i++) view.frame(1/60,1);
        assert.equal(view.uploads.length,count); assert.equal(view.ready,1); assert.equal(view.renders.at(-1),true);
        assert.equal(view.errors.length,0);
    });
}
test('a failed image never reveals a placeholder in the mobile map', async t => {
    const view = sceneSetup(t,32,true); view.scene.mount(); await view.scene.prewarm({force:true}); view.frame(1/60,1);
    assert.equal(view.ready,0); assert.ok(view.errors.length > 0); assert.equal(view.renders.at(-1),false);
});

for (const locked of [true,false]) {
    test(locked ? 'optional polar lock keeps the camera upright when a vertical nudge is requested' : 'desktop retains its original vertical rotation', async t => {
        const view = sceneSetup(t,55,false,{lockPolar:locked});
        view.scene.mount(); await view.scene.prewarm({force:true}); view.frame(1/60,1);
        const radius = view.camera.position.length();
        if (locked) assert.equal(view.controls.minPolarAngle,view.controls.maxPolarAngle);
        else assert.equal(view.controls.maxPolarAngle,Math.PI);
        view.scene.nudgeRotation(0.2,0.4);
        assert.ok(Math.abs(view.camera.position.x) > 0.01);
        assert.ok(Math.abs(view.camera.position.length()-radius) < 1e-6);
        if (locked) assert.ok(Math.abs(view.camera.position.y) < 1e-6);
        else assert.ok(Math.abs(view.camera.position.y) > 0.01);
    });
}


test('mobile focus gains 3% travel while neighboring travel drops 10%, with identical sway', async t => {
    async function capture(options, engaged) {
        const view = sceneSetup(t,55,false,{...options, quietReduced:true});
        view.scene.mount(); await view.scene.prewarm({force:true});
        for(let i=0;i<60;i++) view.frame(1/60,10);
        if(engaged) { view.scene.setPointer(195,275); view.scene.setPointerDown(true); }
        for(let i=0;i<300;i++) view.frame(1/60,10);
        return view.globe.children.slice(1).map(mesh=>mesh.position.clone());
    }
    const idle = await capture({},false), before = await capture({},true);
    const after = await capture({focusPushScale:1.03,neighborPushScale:0.9},true);
    let leaders=0, neighbors=0;
    for(let i=0;i<before.length;i++) {
        const dir=idle[i].clone().normalize();
        const previous=before[i].clone().sub(idle[i]).dot(dir);
        const change=after[i].clone().sub(before[i]).dot(dir);
        if(Math.abs(change)<1e-6) continue;
        if(change>0) { leaders++; assert.ok(previous>0); }
        else neighbors++;
    }
    assert.equal(leaders,1); assert.ok(neighbors>1);
});

test('background preparation reports upload progress and completes without drawing the globe',async t=>{
    const progress=[];
    const view=sceneSetup(t,55,false,{onProgress:value=>progress.push(value)});
    view.scene.mount();await view.scene.prewarm({force:true});
    assert.equal(view.renders.length,0);assert.equal(view.ready,0);
    assert.ok(progress.at(-1)<=.7);
    for(let i=0;i<14;i++) view.scene.prepareFrame();
    assert.equal(view.ready,1);assert.equal(view.uploads.length,55);assert.equal(view.renders.length,0);
    assert.equal(progress.at(-1),1);assert.ok(progress.every((v,i)=>!i||v>=progress[i-1]));
});

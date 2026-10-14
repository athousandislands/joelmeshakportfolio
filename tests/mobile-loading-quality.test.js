import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMapQuality} from '../src/mobile/map-quality.js';
import {displayProgress,MAP_COPY} from '../src/mobile/map-loading.js';
import {createGalleryHint} from '../src/mobile/gallery-hint.js';
import {createMapSession} from '../src/mobile/mind-map-controller.js';

test('mobile quality stays sharp under a stable power-saving 30fps cap',()=>{
    const q=createMapQuality(3);
    for(let i=0;i<20;i++) assert.equal(q.sample(30),2);
});
test('quality needs sustained slow frames, stops at 1.2, and can recover',()=>{
    const q=createMapQuality(3);
    assert.equal(q.sample(20),2); assert.equal(q.sample(20),1.75);
    for(let i=0;i<12;i++) q.sample(20);
    assert.equal(q.ratio,1.2);
    for(let i=0;i<4;i++) q.sample(60);
    assert.equal(q.ratio,1.45);
    for(let i=0;i<12;i++) q.sample(60);
    assert.equal(q.ratio,2);
    assert.equal(createMapQuality(1).ratio,1);
});
test('loading estimate is monotonic, front weighted, and cannot finish before ready',()=>{
    const values=Array.from({length:101},(_,i)=>displayProgress(i/100));
    assert.equal(values[0],0); assert.equal(values[50],60); assert.equal(values[100],99);
    assert.ok(values.every((v,i)=>!i||v>=values[i-1]));
    assert.equal(displayProgress(1,true),100);
    assert.deepEqual(MAP_COPY.slice(1,3),[
        'These references meet in a space between precision and play',
        'Louis Vuitton, Off-White and Maison Margiela offer different ways to rethink identity',
    ]);
    assert.equal(MAP_COPY.length,6);
});
test('Gallery hint is limited to two visits across sessions and dismisses on engagement',()=>{
    let visits=0; const storage={getItem:()=>visits,setItem:(key,v)=>visits=v};
    function setup(){const classes=new Set();const element={hidden:true,offsetWidth:1,classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}};return {hint:createGalleryHint({element,storage,reduced:false}),classes};}
    const first=setup();first.hint.enter();assert.ok(first.classes.has('shown'));first.hint.dismiss();assert.equal(first.classes.size,0);
    const next=setup();next.hint.enter();assert.ok(next.classes.has('shown'));next.hint.dismiss();next.hint.enter();assert.equal(next.classes.size,0);
});
test('preparation creates one paused map and an early click joins the same import',async()=>{
    let resolve; const events=[]; const pending=new Promise(r=>resolve=r);
    const session=createMapSession({load:()=>pending,create:()=>({prepare(){events.push('prepare');},resume(){events.push('resume');},pause(){events.push('pause');},dispose(){events.push('dispose');}}),onLoading:()=>events.push('loading'),onError:()=>events.push('error')});
    const background=session.prepare();const entering=session.enter();resolve({});await Promise.all([background,entering]);
    assert.deepEqual(events,['loading','prepare','resume']);
    session.leave();await session.enter();assert.deepEqual(events.slice(-2),['pause','resume']);session.dispose();
});
test('background preparation is cancelled by teardown and failures stay silent until an explicit visit',async()=>{
    let resolve;const pending=new Promise(r=>resolve=r);let creates=0;
    const session=createMapSession({load:()=>pending,create:()=>{creates++;},onLoading(){},onError(){throw Error('must stay silent');}});
    const task=session.prepare();session.dispose();resolve({});await task;assert.equal(creates,0);
    const failed=createMapSession({load:async()=>{throw Error('offline');},create(){},onLoading(){},onError(){throw Error('must stay silent');}});
    await failed.prepare();assert.equal(failed.active,false);
});

test('loading copy cycles through every passage and cancels timers on completion',async t=>{
    const {createMapLoading}=await import('../src/mobile/map-loading.js');
    const timers=new Map(),frames=new Map();let id=0;
    t.mock.method(globalThis,'setTimeout',(fn,ms)=>{timers.set(++id,{fn,ms});return id;});
    t.mock.method(globalThis,'clearTimeout',key=>timers.delete(key));
    const previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
    globalThis.cancelAnimationFrame=key=>frames.delete(key);
    t.after(()=>{if(previousRAF)globalThis.requestAnimationFrame=previousRAF;else delete globalThis.requestAnimationFrame;if(previousCancel)globalThis.cancelAnimationFrame=previousCancel;else delete globalThis.cancelAnimationFrame;});
    const root={style:{},setAttribute(){}},track={style:{}},number={},copy={classList:{add(){},remove(){}}};
    const loader=createMapLoading({root,track,number,copy,reduced:false});loader.start();
    const runTimer=()=>{const [key,task]=timers.entries().next().value;timers.delete(key);task.fn();return task.ms;};
    for(let i=1;i<=MAP_COPY.length;i++){
        assert.ok(runTimer()>=7000);runTimer();assert.equal(copy.textContent,MAP_COPY[i%MAP_COPY.length]);
    }
    loader.progress(1);loader.complete();assert.equal(number.textContent,'100%');assert.equal(track.style.width,'100%');
    assert.equal(timers.size,0);assert.equal(frames.size,0);
});

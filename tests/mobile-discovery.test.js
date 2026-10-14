import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMindMapDiscovery} from '../src/mobile/mind-map-discovery.js';
import {mindMapIcon} from '../src/mobile/mind-map-ui.js';
function setup(storage, reduced = false, eligible = () => true) {
    const classes = new Set(), listeners = new Map();
    const button = {classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    return {cue:createMindMapDiscovery({button,storage,reduced,eligible}),classes,listeners};
}
test('mobile icon cue is limited to three Home entries across page sessions', () => {
    let count = null; const storage = {getItem:()=>count,setItem:(key,value)=>{count=value;}};
    const first = setup(storage); assert.equal(first.cue.enter(),true); assert.equal(first.cue.enter(),true);
    const next = setup(storage); assert.equal(next.cue.enter(),true); assert.equal(next.cue.enter(),false);
    assert.equal(count,'3'); assert.equal(next.classes.size,0);
});
test('an open map and reduced motion do not consume icon cue entries', () => {
    let count = 0; const storage = {getItem:()=>count,setItem:(key,value)=>{count=Number(value);}};
    assert.equal(setup(storage,true).cue.enter(),false);
    assert.equal(setup(storage,false,()=>false).cue.enter(),false);
    assert.equal(count,0);
});
test('blocked storage uses a three-entry page limit and completion clears animation', () => {
    const {cue,classes,listeners} = setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
    cue.enter(); listeners.get('animationend')(); assert.equal(classes.size,0);
    assert.deepEqual([cue.enter(),cue.enter(),cue.enter()],[true,true,false]);
    cue.dispose(); assert.equal(listeners.size,0);
});
test('only surrounding dots belong to the rotating group; centre stays outside', () => {
    const svg = mindMapIcon(), group = svg.match(/<g class="mindmap-orbit-dots">(.*?)<\/g>/)[1];
    assert.equal((group.match(/<circle /g)||[]).length,6);
    assert.match(svg,/cy="12" r="2.1"\/><g/);
});

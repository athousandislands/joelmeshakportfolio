import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPulseDiscovery} from '../src/desktop/pulse-discovery.js';
function setup(storage, reduced = false) {
    const classes = new Set(), listeners = new Map();
    const label = {classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
    return {cue:createPulseDiscovery({label,storage,reduced}),classes,listeners};
}
test('Pulse cue runs on only three entries, including entries in a later page session', () => {
    let count = null; const storage = {getItem:()=>count,setItem:(key,value)=>{count=value;}};
    const first = setup(storage); assert.equal(first.cue.enter(),true); first.cue.stop(); assert.equal(first.cue.enter(),true);
    const next = setup(storage); assert.equal(next.cue.enter(),true); assert.equal(next.cue.enter(),false);
    assert.equal(count,'3'); assert.equal(next.classes.size,0);
});
test('blocked storage still limits the cue to three entries in the page', () => {
    const {cue} = setup({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
    assert.deepEqual([cue.enter(),cue.enter(),cue.enter(),cue.enter()],[true,true,true,false]);
});
test('reduced motion does not animate or consume discovery entries', () => {
    let writes = 0; const {cue,classes} = setup({getItem:()=>null,setItem:()=>writes++},true);
    assert.equal(cue.enter(),false); assert.equal(classes.size,0); assert.equal(writes,0);
});
test('interaction, animation completion and disposal stop the cue', () => {
    const {cue,classes,listeners} = setup(); cue.enter(); cue.stop(); assert.equal(classes.size,0);
    cue.enter(); listeners.get('animationend')(); assert.equal(classes.size,0);
    cue.dispose(); assert.equal(listeners.size,0);
});

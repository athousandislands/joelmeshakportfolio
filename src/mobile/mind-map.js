import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { gsap } from 'gsap';
import { createMindMap } from '../desktop/mind-map.js';

// A mobile host for the existing scene: no folders, desktop renderer or camera.
export function createMobileMap({ stage, loading, tileCount, reduced, onReady, onError, onEngage }) {
    let disposed = false, paused = true, frame = 0, previous = 0, elapsed = 0, render = null;
    let ratio = Math.min(devicePixelRatio || 1, 1.5), ratioChanged = null;
    let sampleStart = 0, frames = 0, slowWindows = 0;
    const subscribers = new Set();
    // Match wide desktop's image travel. The scene's narrow-screen boost
    // would otherwise multiply protrusion by 1.45 on a portrait phone.
    const V = { width: 1, height: 1, aspect: 1, t: 1, onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const listeners = [];
    function listen(target, type, fn, options) {
        target.addEventListener(type, fn, options);
        listeners.push(() => target.removeEventListener(type, fn, options));
    }
    function fail(error) { if (!disposed) onError(error); }
    function size() {
        const box = stage.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        if (V.width === box.width && V.height === box.height) return;
        V.width = box.width; V.height = box.height; V.aspect = box.width / box.height;
        subscribers.forEach(fn => fn());
    }
    size();
    const scene = createMindMap({
        THREE, OrbitControls, KTX2Loader, V, renderer: null,
        Governor: { ratioFor: () => ratio, register(key, page, fn) { ratioChanged = fn; fn(ratio); }, unregister() { ratioChanged = null; } },
        guardContext(renderer) {
            const canvas = renderer.domElement;
            const lost = event => { event.preventDefault(); fail(new Error('Graphics context lost')); };
            canvas.addEventListener('webglcontextlost', lost);
            return { markDisposing() { canvas.removeEventListener('webglcontextlost', lost); }, destroy() { canvas.removeEventListener('webglcontextlost', lost); } };
        },
        Idle: { run: fn => setTimeout(fn, 0) },
        Loop: { register(page, fn) { render = fn; } },
        REDUCED_MOTION: reduced, gsap, clamp, mix: (a, b, t) => a + (b - a) * t,
    }, {
        container: stage, loading, tileCount, strictReady: true,
        pushScale: 1.06, swayScale: 1.2, effectRadiusScale: 1.08,
        globeTilt: { x: 0, y: 0.21 }, lockPolar: true, workerLimit: 2, fitRadius: 3.55, tileSize: 0.78 * Math.sqrt(76 / tileCount), quietReduced: true,
        powerPreference: 'default',
        frameCamera(camera, viewport) {
            camera.clearViewOffset();
            if (viewport.aspect <= 1) return;
            const stageBox = stage.getBoundingClientRect();
            const navBottom = document.getElementById('tabslot').getBoundingClientRect().bottom - stageBox.top;
            const top = navBottom + 18;
            const available = Math.max(100, viewport.height - top - 16);
            const center = top + available / 2;
            camera.position.z = Math.max(camera.position.z, 3.55 / Math.tan(Math.PI / 6) * viewport.height / available);
            camera.setViewOffset(viewport.width, viewport.height, 0, viewport.height / 2 - center, viewport.width, viewport.height);
        },
        onReady() {
            stage.dataset.ready = 'true'; stage.dataset.tiles = String(tileCount); onReady();
        }, onError: fail,
    });
    const observer = new ResizeObserver(size);
    const pointers = new Set();
    const clearHold = () => scene.clearPointer();
    const position = event => {
        const box = stage.getBoundingClientRect();
        scene.setPointer(event.clientX - box.left, event.clientY - box.top);
    };
    listen(stage, 'pointerdown', event => {
        if (paused || event.button !== 0 || stage.dataset.ready !== 'true') return;
        pointers.add(event.pointerId);
        onEngage();
        position(event);
        // Same engagement as desktop: contact begins the effect immediately;
        // moving the contact updates its location without cancelling the hold.
        scene.setPointerDown(true);
    }, { capture: true });
    listen(stage, 'pointermove', event => {
        if (!paused && pointers.has(event.pointerId)) position(event);
    }, { capture: true });
    const end = event => {
        pointers.delete(event.pointerId);
        if (!pointers.size) clearHold();
    };
    listen(window, 'pointerup', end); listen(window, 'pointercancel', end);
    listen(stage, 'keydown', event => {
        if (paused || event.target !== stage || stage.dataset.ready !== 'true') return;
        const rotations = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0] };
        if (rotations[event.key]) { event.preventDefault(); onEngage(); scene.nudgeRotation(...rotations[event.key]); }
        if (event.key === ' ') { event.preventDefault(); onEngage(); scene.setPointer(V.width / 2, V.height / 2); scene.setPointerDown(true); }
    });
    listen(stage, 'keyup', event => { if (event.key === ' ') clearHold(); });
    listen(stage, 'blur', clearHold);
    function tick(now) {
        frame = 0;
        if (disposed || paused || document.hidden) return;
        const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
        previous = now; elapsed += dt;
        render?.(dt, elapsed);
        if (disposed || paused) return;
        frames++;
        if (!sampleStart) sampleStart = now;
        if (now - sampleStart >= 2000) {
            const fps = frames * 1000 / (now - sampleStart);
            slowWindows = fps < 40 ? slowWindows + 1 : 0;
            if (slowWindows >= 2 && ratio > 0.85) {
                ratio = Math.max(0.85, ratio - 0.25); ratioChanged?.(ratio); slowWindows = 0;
            }
            stage.dataset.fps = String(Math.round(fps));
            frames = 0; sampleStart = now;
        }
        frame = requestAnimationFrame(tick);
    }
    listen(document, 'visibilitychange', () => {
        clearHold(); pointers.clear(); cancelAnimationFrame(frame); frame = 0; previous = 0; sampleStart = 0; frames = 0;
        if (!document.hidden && !disposed && !paused) frame = requestAnimationFrame(tick);
    });
    return {
        start() {
            scene.mount();
            if (disposed) return;
            const canvas = stage.querySelector('canvas');
            if (canvas) { canvas.setAttribute('aria-hidden', 'true'); canvas.style.touchAction = 'none'; }
            this.resume();
        },
        pause() {
            if (disposed || paused) return;
            paused = true; cancelAnimationFrame(frame); frame = 0;
            clearHold(); pointers.clear(); observer.disconnect();
            scene.setTouchSuppressed(true);
        },
        resume() {
            if (disposed || !paused) return;
            paused = false; previous = 0; frames = 0; sampleStart = 0;
            scene.setTouchSuppressed(false);
            size(); observer.observe(stage);
            if (!document.hidden) frame = requestAnimationFrame(tick);
        },
        dispose() {
            if (disposed) return;
            disposed = true; cancelAnimationFrame(frame); clearHold(); observer.disconnect();
            listeners.forEach(remove => remove()); pointers.clear(); scene.dispose();
            delete stage.dataset.ready; delete stage.dataset.tiles; delete stage.dataset.fps;
        },
    };
}

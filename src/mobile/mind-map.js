import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { gsap } from 'gsap';
import { createMapQuality } from './map-quality.js';
import { createMindMap } from '../desktop/mind-map.js';

// A mobile host for the existing scene: no folders, desktop renderer or camera.
export function createMobileMap({ stage, loading, tileCount, reduced, onReady, onError, onEngage, onProgress }) {
    let disposed = false, paused = true, frame = 0, previous = 0, elapsed = 0, render = null;
    const quality = createMapQuality(devicePixelRatio);
    let ratio = quality.ratio, ratioChanged = null;
    let prepareFrame = 0, preparing = false, hasEntered = false;
    let sampleStart = 0, frames = 0;
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
    function size(force = false) {
        const box = stage.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        if (!force && V.width === box.width && V.height === box.height) return;
        V.width = box.width; V.height = box.height; V.aspect = box.width / box.height;
        subscribers.forEach(fn => fn());
    }
    size();
    if (V.width === 1) { V.width = window.innerWidth; V.height = window.innerHeight; V.aspect = V.width / V.height; }
    stage.dataset.pixelRatio = String(ratio);
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
        container: stage, loading, tileCount, strictReady: true, onProgress, frameIndependent: true, loadingTimeout: 90000,
        pushScale: 1.06, holdPushScale: 1.25, focusPushScale: 1.03, neighborPushScale: 0.9, swayScale: 1.32, effectRadiusScale: 1.08,
        globeTilt: { x: 0, y: 0.21 }, polarRange: [0.35, Math.PI - 0.35], workerLimit: 2, fitRadius: 3.55, tileSize: 0.78 * Math.sqrt(76 / tileCount), quietReduced: true,
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
            preparing = false; cancelAnimationFrame(prepareFrame); prepareFrame = 0;
            stage.dataset.ready = 'true'; stage.dataset.tiles = String(tileCount); onReady();
        }, onError: fail,
    });
    const observer = new ResizeObserver(() => size());
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
        const rotations = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] };
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
        if (stage.dataset.ready !== 'true') { frame = requestAnimationFrame(tick); return; }
        frames++;
        if (!sampleStart) sampleStart = now;
        if (now - sampleStart >= 2000) {
            const fps = frames * 1000 / (now - sampleStart);
            const nextRatio = quality.sample(fps);
            if (nextRatio !== ratio) {
                ratio = nextRatio; ratioChanged?.(ratio); stage.dataset.pixelRatio = String(ratio);
            }
            stage.dataset.fps = String(Math.round(fps));
            frames = 0; sampleStart = now;
        }
        frame = requestAnimationFrame(tick);
    }
    listen(document, 'visibilitychange', () => {
        clearHold(); pointers.clear(); cancelAnimationFrame(frame); cancelAnimationFrame(prepareFrame); prepareFrame = 0; frame = 0; previous = 0; sampleStart = 0; frames = 0;
        quality.reset();
        if (!document.hidden && !disposed) {
            if (!paused) frame = requestAnimationFrame(tick);
            else if (preparing) prepareFrame = requestAnimationFrame(prepareTick);
        }
    });
    function prepareTick() {
        prepareFrame = 0;
        if (disposed || !preparing || document.hidden || !paused) return;
        scene.prepareFrame();
        if (preparing) prepareFrame = requestAnimationFrame(prepareTick);
    }
    return {
        prepare() {
            preparing = true;
            scene.mount(); scene.setTouchSuppressed(true);
            if (!document.hidden) prepareFrame = requestAnimationFrame(prepareTick);
        },
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
            if (preparing && !document.hidden) prepareFrame = requestAnimationFrame(prepareTick);
        },
        resume() {
            if (disposed || !paused) return;
            paused = false; previous = 0; frames = 0; sampleStart = 0; quality.reset();
            cancelAnimationFrame(prepareFrame); prepareFrame = 0;
            scene.setTouchSuppressed(false);
            size(!hasEntered); hasEntered = true; observer.observe(stage);
            if (!document.hidden) frame = requestAnimationFrame(tick);
        },
        dispose() {
            if (disposed) return;
            disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(prepareFrame); clearHold(); observer.disconnect();
            listeners.forEach(remove => remove()); pointers.clear(); scene.dispose();
            delete stage.dataset.ready; delete stage.dataset.tiles; delete stage.dataset.fps; delete stage.dataset.pixelRatio;
        },
    };
}

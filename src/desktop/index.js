import { videoPoster } from '../shared/media.js';
import { createFolderPreviews } from './folder-previews.js';
import { copyWithFeedback } from '../shared/clipboard.js';
import { createPulse } from './pulse.js';
import { createMindMap } from './mind-map.js';
import { createCollections } from './collections.js';
import { allProjectsData, buildMediaData } from './project-data.js';
import { createAssets } from './assets.js';
import { createGovernor } from './governor.js';
import { VaultBridge } from '../shared/vault-bridge.js';

export async function initDesktop(Homepage) {
    const [THREE, { RoomEnvironment }, { OrbitControls }, { KTX2Loader }, { gsap }] = await Promise.all([
        import('three'),
        import('three/addons/environments/RoomEnvironment.js'),
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/loaders/KTX2Loader.js'),
        import('gsap'),
    ]);

    /* ==========================================================================
       0. SMALL MATH HELPERS
       ========================================================================== */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const mix = (a, b, t) => a * (1 - t) + b * t;
    const smoothstep = (min, max, value) => {
        const x = clamp((value - min) / (max - min), 0, 1);
        return x * x * (3 - 2 * x);
    };

    const Router = {
        scene: 1,
        forceField: 0
    };

    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* LOW_POWER removed — its UA test matched /iPad/, silently routing every
       tablet into a reduced build (33-of-76 tiles, 256px textures, flattened
       glass, fewer particles). One build now for every #desktop-root device;
       load is managed at runtime by the Governor and Idle scheduler instead. */

    /* ==========================================================================
       0b. IDLE SCHEDULER — requestIdleCallback doesn't exist on Safari, so
       the old fallback (setTimeout 1ms) ran background decode work AT full
       priority, competing with rendering. This piggybacks on the render
       loop's own frame timing instead: work only runs under budget, with a
       hard per-callback deadline.
       ========================================================================== */
    const Idle = (() => {
        const queue = [];
        let lastFrameMs = 16;
        let scheduled = false;
        const BUDGET_MS = 6;

        function pump() {
            scheduled = false;
            if (!queue.length) return;

            /* If the app is struggling, do nothing this frame. */
            if (lastFrameMs > 20) { schedule(); return; }

            const start = performance.now();
            const deadline = {
                timeRemaining: () => Math.max(0, BUDGET_MS - (performance.now() - start)),
                didTimeout: false
            };
            while (queue.length && deadline.timeRemaining() > 0.5) {
                const job = queue.shift();
                try { job(deadline); } catch (e) { console.error('[idle]', e); }
            }
            if (queue.length) schedule();
        }

        function schedule() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => setTimeout(pump, 0));
        }

        return {
            run(fn) { queue.push(fn); schedule(); },
            note(frameMs) { lastFrameMs = frameMs; },
            get pending() { return queue.length; }
        };
    })();

    /* Back-compat shim for the few call sites that just want "later, politely". */
    const requestIdle = (cb) => Idle.run(cb);

    /* ==========================================================================
       1. VIEWPORT — the only place that reads window.innerWidth/Height or
       visualViewport. Two tiers: --vh/--vw update on every read (cheap), but
       heavy subscribers (renderer resize, camera fits) only fire on a
       MEANINGFUL change — otherwise the URL bar collapsing mid-scroll
       reallocated framebuffers on every swipe.
       ========================================================================== */
    const URL_BAR_TOLERANCE = 130;   // px — larger than any mobile browser chrome

    const Viewport = (() => {
        const subscribers = new Set();
        let pending = false;
        let pendingForce = false;

        /* The height the heavy subscribers were last sized to. Distinct from
           state.height, which tracks the live value for CSS. */
        let committedHeight = 0;
        let committedWidth = 0;
        let committedDpr = 0;

        const state = {
            width: 0,
            height: 0,
            dpr: 1,
            aspect: 1,
            t: 0,
            columns: 3,
            compact: false,
            orientation: 'landscape'
        };

        function read() {
            const vv = window.visualViewport;
            const w = Math.round(vv ? vv.width : window.innerWidth);
            const h = Math.round(vv ? vv.height : window.innerHeight);
            return { w, h };
        }

        const MIN_CARD_PX = 260;
        const GAP_FACTOR = 1.30;

        /* Returns true when the change is big enough to warrant a full relayout.
           `force`, when true, bypasses BOTH guards below unconditionally — this
           is what the settle-timer and the poll-based backstop rely on to
           guarantee a real re-sync regardless of what state already believes. */
        function recompute(force) {
            const { w, h } = read();
            const dpr = window.devicePixelRatio || 1;

            const anyChange = force || (w !== state.width || h !== state.height || dpr !== state.dpr);
            if (!anyChange) return false;

            state.width = w;
            state.height = h;
            state.dpr = dpr;
            state.aspect = w / h;
            state.orientation = w >= h ? 'landscape' : 'portrait';
            state.t = clamp((state.aspect - 0.50) / (1.40 - 0.50), 0, 1);
            state.columns = clamp(Math.floor(w / (MIN_CARD_PX * GAP_FACTOR)), 1, 3);
            state.compact = state.columns === 1;

            /* CSS always tracks the live viewport. This is cheap. */
            const root = document.documentElement;
            root.style.setProperty('--vh', (h / 100) + 'px');
            root.style.setProperty('--vw', (w / 100) + 'px');
            root.classList.toggle('compact', state.compact);

            const widthChanged = w !== committedWidth;
            const dprChanged = dpr !== committedDpr;
            const heightDelta = Math.abs(h - committedHeight);
            const meaningful = force || widthChanged || dprChanged || heightDelta > URL_BAR_TOLERANCE;

            if (!meaningful) return false;

            committedWidth = w;
            committedHeight = h;
            committedDpr = dpr;
            return true;
        }

        function schedule(force) {
            if (pending) { if (force) pendingForce = true; return; }
            pending = true;
            pendingForce = !!force;
            requestAnimationFrame(() => {
                pending = false;
                const f = pendingForce;
                pendingForce = false;
                if (recompute(f)) {
                    subscribers.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
                }
            });
        }

        /* Trailing settle-check: an OS fullscreen animation emits resize events
           with intermediate dimensions and doesn't always fire once more at
           the true final size — without this, the drawing buffer can commit
           mid-animation while the CSS box has already settled, stretching a
           stale-aspect buffer (the distorted orb/folders symptom).
           schedule(true) forces a full re-notify, bypassing both of
           recompute()'s guards, not just one. */
        let settleTimer = null;
        function scheduleWithSettle() {
            schedule();
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => schedule(true), 220);
        }

        window.addEventListener('resize', scheduleWithSettle, { passive: true });
        window.addEventListener('orientationchange', scheduleWithSettle, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleWithSettle, { passive: true });
        }
        document.addEventListener('fullscreenchange', scheduleWithSettle, { passive: true });

        /* Backstop: polls window.innerWidth/Height directly against the last
           committed values. A prior ResizeObserver on documentElement was
           circular — html's own size is set via --app-w/--app-h, which only
           this function writes, so the observer could never catch a case the
           window/visualViewport listeners had already missed. Direct polling
           has no such blind spot; comparing first keeps steady-state cost to
           two number comparisons, forcing only on actual drift. */
        const pollTimer = setInterval(() => {
            const { w, h } = read();
            if (w !== committedWidth || Math.abs(h - committedHeight) > URL_BAR_TOLERANCE) {
                schedule(true);
            }
        }, 350);

        recompute();

        return {
            state,
            destroy() {
                clearInterval(pollTimer);
                clearTimeout(settleTimer);
                subscribers.clear();
                window.removeEventListener('resize', scheduleWithSettle);
                window.removeEventListener('orientationchange', scheduleWithSettle);
                window.visualViewport?.removeEventListener('resize', scheduleWithSettle);
                document.removeEventListener('fullscreenchange', scheduleWithSettle);
            },
            get width() { return state.width; },
            get height() { return state.height; },
            get aspect() { return state.aspect; },
            get t() { return state.t; },
            get columns() { return state.columns; },
            get compact() { return state.compact; },
            get dpr() { return state.dpr; },
            onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
            /* refresh(true) forces a real re-sync regardless of what state
               already believes — recompute()'s force parameter now bypasses
               both of its guards. Used on bfcache restore, where dimensions
               may not have changed by the checks recompute() would otherwise
               make, but GPU resources may have been dropped while frozen. */
            refresh: schedule
        };
    })();

    const V = Viewport;

    /* ==========================================================================
       1b. PIXEL RATIO — one 1.5 ceiling app-wide (scene 3's old 2.0 meant
       ~8x the framebuffer bytes with antialias:true; indistinguishable at
       phone viewing distance). The Governor itself was the startup stutter —
       setPixelRatio() reallocates every buffer, and judging every 1s from
       0.7s fired repeatedly through the boot window. Now: 4s grace, 3
       consecutive bad windows before dropping, never raises back up.
       ========================================================================== */
    const DPR_CAP = 1.5;

    const Governor = createGovernor({ V, Router, clamp });

    /* ==========================================================================
       1c. CONTEXT LOSS GUARD — Scene3.unmount()'s deliberate loseContext()
       used to trip the recovery timer with no way to receive
       webglcontextrestored, surfacing "Graphics stopped responding" over
       whatever scene the user had since navigated to. markDisposing() now
       short-circuits intentional teardown; recovery state is per-renderer.
       ========================================================================== */
    const RECOVERY_GRACE_MS = 5000;
    const lostContexts = new Set();     // labels currently in a lost state
    const failedContexts = new Map();   // label -> scene, for unrecoverable losses

    function syncRecoveryUI() {
        const root = document.documentElement;
        root.classList.toggle('gl-lost', lostContexts.size > 0);

        let showOverlay = false;
        failedContexts.forEach((scene) => { if (scene === Router.scene) showOverlay = true; });
        root.classList.toggle('gl-unrecoverable', showOverlay);
    }

    function guardContext(renderer, label, scene, onRestore) {
        const canvas = renderer.domElement;
        let timer = null;
        let disposing = false;

        const onLost = (e) => {
            /* Intentional teardown — not an error, not a user-visible event. */
            if (disposing) return;

            e.preventDefault();
            console.warn(`[${label}] WebGL context lost; awaiting restore.`);
            lostContexts.add(label);
            syncRecoveryUI();

            clearTimeout(timer);
            timer = setTimeout(() => {
                if (disposing) return;
                console.error(`[${label}] context did not restore within ${RECOVERY_GRACE_MS}ms.`);
                failedContexts.set(label, scene);
                syncRecoveryUI();
            }, RECOVERY_GRACE_MS);
        };

        const onRestored = () => {
            if (disposing) return;
            console.warn(`[${label}] WebGL context restored.`);
            clearTimeout(timer);
            lostContexts.delete(label);
            failedContexts.delete(label);
            syncRecoveryUI();
            renderer.setPixelRatio(Governor.ratioFor());
            renderer.setSize(V.width, V.height, false);
            if (onRestore) onRestore();
        };

        canvas.addEventListener('webglcontextlost', onLost, false);
        canvas.addEventListener('webglcontextrestored', onRestored, false);

        return {
            /* Call BEFORE any deliberate loseContext()/dispose(). */
            markDisposing() { disposing = true; },
            destroy() {
                disposing = true;
                clearTimeout(timer);
                canvas.removeEventListener('webglcontextlost', onLost, false);
                canvas.removeEventListener('webglcontextrestored', onRestored, false);
                lostContexts.delete(label);
                failedContexts.delete(label);
                syncRecoveryUI();
            }
        };
    }

    /* ==========================================================================
       2. FIT — ONE FUNCTION, USED BY EVERY SCENE
       ========================================================================== */
    function fitDistance(designW, designH, fovDeg, padRatio) {
        const halfTan = Math.tan(fovDeg * Math.PI / 360);
        const byWidth = (designW * (1 + padRatio) / 2) / (halfTan * V.aspect);
        const byHeight = (designH * (1 + padRatio) / 2) / halfTan;
        return Math.max(byWidth, byHeight);
    }

    function visibleSizeAt(distance, fovDeg) {
        const halfTan = Math.tan(fovDeg * Math.PI / 360);
        const h = 2 * halfTan * distance;
        return { w: h * V.aspect, h };
    }

    /* ==========================================================================
       3. SCHEDULER — ONE rAF LOOP FOR THE WHOLE APP
       ========================================================================== */


    const Loop = (() => {
        const clock = new THREE.Clock();
        let time = 0;
        let frameId = 0;
        let running = false;
        const handlers = { 1: null, 2: null, 3: null };

        function tick() {
            /* rAF is scheduled FIRST so a throwing handler cannot kill the loop. */
            if (!running) return;
            frameId = requestAnimationFrame(tick);
            const dt = Math.min(clock.getDelta(), 0.1);
            time += dt;
            Idle.note(dt * 1000);
            const h = handlers[Router.scene];
            const visible = !document.hidden && document.getElementById('homepage').classList.contains('gone');
            if (h && visible) {
                try { h(dt, time); }
                catch (e) { console.error('[loop] scene', Router.scene, e); }
            }
            if (visible) Governor.sample(dt, time);
        }

        return {
            register(scene, fn) { handlers[scene] = fn; },
            start() { if (!running) { running = true; tick(); } },
            stop() { running = false; cancelAnimationFrame(frameId); },
            get time() { return time; }
        };
    })();

    /* ==========================================================================
       4. PROJECT DATA
       ========================================================================== */
    /* ==========================================================================
       5. MEDIA DIMENSION REGISTRY / ASSET PIPELINE
       ========================================================================== */
    const Assets = createAssets({ V, DPR_CAP, Idle, allProjectsData, buildMediaData });

    const MediaDims = Assets;

    /* ==========================================================================
       5b. VIDEO POSTERS — preload="none" needs an explicit poster or the
       card is blank (iOS won't reliably paint a frame from preload=metadata
       either). `enabled` stays false, keeping the safe preload="metadata"
       path, until poster files exist; flip once generated:
         ffmpeg -i in.mp4 -vf "select=eq(n\,0),scale=800:-1" -frames:v 1 -q:v 80 out.webp
       ========================================================================== */
    const posterFor = videoPoster;
    const IDLE_PRELOAD = src => videoPoster(src) ? 'none' : 'metadata';

    /* ==========================================================================
       6. SCENE 2 — COLLECTIONS
       ========================================================================== */
    const S2 = createCollections({ allProjectsData, buildMediaData, Assets, V, Loop, Router, REDUCED_MOTION, gsap, clamp, fitDistance, visibleSizeAt, posterFor, IDLE_PRELOAD });

    /* ==========================================================================
       7. SCENE 1 — WEBGL LANDING
       ========================================================================== */
    const container = document.getElementById('canvas-container');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(V.width, V.height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    Governor.register('scene1', 1, (r) => renderer.setPixelRatio(r));
    renderer.shadowMap.enabled = false;
    renderer.autoClear = false;
    renderer.setClearColor('#CCCCCC', 1);
    container.appendChild(renderer.domElement);
    const scene1Guard = guardContext(renderer, 'scene1', 1, () => {
        rebuildFolderEnvironment();
    });

    /* ---- orb ---- */
    const ORB_FOV = 45;
    const ORB_CAM_Z = 3.8;
    const orbScene = new THREE.Scene();
    const orbCam = new THREE.PerspectiveCamera(ORB_FOV, V.aspect, 0.1, 1000);
    orbCam.position.set(0, 0, ORB_CAM_Z);

    const dynamicVertexStage = `
        uniform float uTimeline; uniform float uShellRadius; uniform float uMirrorProgress;
        uniform float uBurnProgress; uniform float uClearProgress; uniform float uAspect;
        uniform float uForceField; uniform float uBreathIntensity; uniform float uParticleSize;
        uniform float uConverge;
        attribute float pRandomPhase; attribute float aType; attribute vec3 aDrift; attribute float aColorType;
        varying float vGlowIntensity; varying float vAlpha; varying float vType; varying float vColorType; varying float vColorMix;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
            vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float f = 0.0; f += 0.5000 * noise(p); p = p * 2.02; f += 0.2500 * noise(p); p = p * 2.03; f += 0.1250 * noise(p); p = p * 2.01; f += 0.0625 * noise(p); return f; }
        void main() {
            vType = aType; vColorType = aColorType;
            vec3 surfaceNormal = normalize(position);
            float constantBreath = sin(uTimeline * 1.5) * uBreathIntensity;
            float breathOutExpansion = smoothstep(0.0, 0.6, uBurnProgress) * 0.10;
            float burnScale = 1.0 + breathOutExpansion;
            float currentGrowthFactor = 1.0 + (uMirrorProgress * 0.24) + constantBreath;
            float dynamicRadius = uShellRadius * currentGrowthFactor * burnScale;
            float strictAmplitudeCeiling = dynamicRadius * 0.05; float structuralFrequency = 1.4;
            float asymmetryMap = sin(surfaceNormal.x * structuralFrequency + uTimeline * 0.3) * cos(surfaceNormal.y * structuralFrequency);
            float currentIrregularity = asymmetryMap * strictAmplitudeCeiling * uMirrorProgress;
            vec3 baselinePosition = surfaceNormal * (dynamicRadius + currentIrregularity);

            baselinePosition += vec3(sin(uTimeline * 1.32 + pRandomPhase * 6.28) * 0.016, cos(uTimeline * 1.54 + pRandomPhase * 6.28) * 0.016, sin(uTimeline * 0.99 + pRandomPhase * 3.14) * 0.016);
            float rawNoise = fbm(surfaceNormal * 3.5 + uTimeline * 0.1);
            float burnMask = smoothstep(0.3, 0.7, rawNoise);
            float sweep = uBurnProgress * 2.0;
            float timeSinceIgnition = max(0.0, sweep - burnMask);
            vAlpha = 1.0; vColorMix = 0.0; vGlowIntensity = 0.0;

            if (timeSinceIgnition > 0.0) {
                vColorMix = smoothstep(0.0, 0.4, timeSinceIgnition);
                float lingerFactor = pRandomPhase * 0.3;
                vec3 driftOffset = aDrift * ((1.0 - exp(-timeSinceIgnition * 4.0)) * 1.2 + timeSinceIgnition * 0.8) * 2.24;
                driftOffset.x += sin(uTimeline * 0.5 + pRandomPhase * 10.0) * timeSinceIgnition * 0.1;
                driftOffset.y += cos(uTimeline * 0.4 + pRandomPhase * 10.0) * timeSinceIgnition * 0.1;
                driftOffset.z += sin(uTimeline * 0.45 + pRandomPhase * 10.0) * timeSinceIgnition * 0.1;
                baselinePosition += driftOffset;

                if (aType > 0.5) {
                    float peripheryBlend = smoothstep(0.2, 1.5, timeSinceIgnition);
                    vec2 outwardDir = normalize(surfaceNormal.xy + vec2(0.001));
                    float pushRandom = 1.0 + pRandomPhase * 1.0;
                    vec2 targetXY = outwardDir * vec2(uAspect * 1.62, 1.62) * pushRandom;
                    targetXY *= (1.0 + uClearProgress * 1.344);
                    targetXY *= 0.4;
                    targetXY.x += sin(uTimeline * 0.15 + pRandomPhase * 20.0) * 0.4;
                    targetXY.y += cos(uTimeline * 0.18 + pRandomPhase * 20.0) * 0.4;
                    float zDrift = sin(uTimeline * 0.2 + pRandomPhase * 15.0) * 0.5;
                    vec3 peripheryPos = vec3(targetXY, surfaceNormal.z * 0.5 - 0.5 + zDrift);
                    baselinePosition = mix(baselinePosition, peripheryPos, peripheryBlend);
                    vAlpha = 1.0; vGlowIntensity = smoothstep(0.0, 0.5, timeSinceIgnition) * 0.8;
                } else {
                    vAlpha = 1.0 - smoothstep(0.1 + lingerFactor, 0.8 + lingerFactor, timeSinceIgnition);
                    vGlowIntensity = smoothstep(0.0, 0.2, timeSinceIgnition) * (1.0 - smoothstep(0.2, 0.8, timeSinceIgnition));
                }
            }

            vec3 pushDir = normalize(surfaceNormal);
            vec3 forceDir;
            if (aColorType < 0.30) {
                vec3 camPos = vec3(0.0, 0.0, ${ORB_CAM_Z.toFixed(1)});
                vec3 toCam = normalize(camPos - baselinePosition);
                forceDir = normalize(mix(pushDir, toCam, 0.85));
            } else {
                vec2 dirXY = normalize(pushDir.xy) * 0.9;
                float dirZ = 0.1;
                forceDir = normalize(vec3(dirXY, dirZ));
            }

            float forceMagnitude = uForceField * 1.5;
            vec3 displacement = forceDir * forceMagnitude;

            float targetZ = baselinePosition.z + displacement.z;
            float maxZ = 2.8;
            if (targetZ > maxZ) {
                float excess = targetZ - maxZ;
                targetZ = maxZ + (1.0 - exp(-excess * 2.0));
                displacement.z = targetZ - baselinePosition.z;
            }

            baselinePosition += displacement;

            /* ENTRANCE: uConverge runs 1->0 once on entry; each particle scatters
               from its own random-phase attribute so arrivals aren't radial.
               Purely additive — at 0 every term vanishes, so the settled orb
               is unchanged from before this existed. */
            if (uConverge > 0.0) {
                float sc = uConverge * uConverge;   // ease-in: most travel happens early
                vec3 scatterDir = normalize(vec3(
                    sin(pRandomPhase * 12.9898) ,
                    sin(pRandomPhase * 78.233 + 1.7),
                    sin(pRandomPhase * 37.719 + 3.3)
                ) + surfaceNormal * 0.35);
                float dist = 9.0 + pRandomPhase * 11.0;
                baselinePosition += scatterDir * dist * sc;
            }

            vec4 viewSpacePosition = modelViewMatrix * vec4(baselinePosition, 1.0);
            gl_Position = projectionMatrix * viewSpacePosition;
            float anchorSize = uParticleSize;
            if (aType < 0.5) { anchorSize *= vAlpha; } else { anchorSize *= mix(1.0, 1.3, smoothstep(0.0, 1.0, timeSinceIgnition)); }
            gl_PointSize = anchorSize / -viewSpacePosition.z;
        }
    `;

    /* `discard` removed: on Apple/PowerVR tile GPUs a shader containing it
       becomes "may kill fragments", disabling early-Z for the whole draw call
       — costly across 3060 overlapping sprites. smoothstep already yields 0
       for the discarded range, so alpha-0 blends to the identical result. */
    const dynamicFragmentStage = `
        uniform float uClearProgress; uniform float uBurnProgress; uniform float uTimeline; uniform float uGlobalAlpha;
        varying float vGlowIntensity; varying float vAlpha; varying float vType; varying float vColorType; varying float vColorMix;
        void main() {
            vec2 particleCoord = gl_PointCoord - vec2(0.5);
            vec3 colorA = vec3(0.627, 0.627, 0.627); vec3 colorB = vec3(0.784, 0.784, 0.784);
            vec3 colorC = vec3(0.910, 0.910, 0.910); vec3 colorD = vec3(1.000, 1.000, 1.000);
            float p = clamp((uBurnProgress - vColorType * 0.4) / 0.6, 0.0, 1.0);
            vec3 particleColor;
            if (p < 0.333) { particleColor = mix(colorA, colorB, p * 3.0); }
            else if (p < 0.666) { particleColor = mix(colorB, colorC, (p - 0.333) * 3.0); }
            else { particleColor = mix(colorC, colorD, (p - 0.666) * 3.0); }
            vec3 finalShadingColor = particleColor;
            float pulse = 1.0 + sin(uTimeline * 4.0 + vColorType * 15.0) * 0.4;
            if (vColorMix > 0.01) { finalShadingColor += particleColor * (vGlowIntensity * pulse); }
            float fadeOut = (vType > 0.5) ? mix(1.0, 0.5, uClearProgress) : 1.0;
            float softEdgeAlpha = smoothstep(0.5, 0.33, length(particleCoord)) * 0.95 * vAlpha * fadeOut * uGlobalAlpha;
            gl_FragColor = vec4(finalShadingColor, softEdgeAlpha);
        }
    `;

    const totalParticles = 3060;
    const structuralGeometry = new THREE.BufferGeometry();
    {
        const spatialCoords = new Float32Array(totalParticles * 3);
        const randomPhases = new Float32Array(totalParticles);
        const types = new Float32Array(totalParticles);
        const drifts = new Float32Array(totalParticles * 3);
        const colorTypes = new Float32Array(totalParticles);

        const indices = Array.from({ length: totalParticles }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        for (let i = 0; i < totalParticles; i++) {
            const idx = indices[i];
            const phi = Math.acos(-1 + (2 * idx) / totalParticles);
            const theta = Math.sqrt(totalParticles * Math.PI) * phi;
            spatialCoords[idx * 3] = Math.cos(theta) * Math.sin(phi);
            spatialCoords[idx * 3 + 1] = Math.sin(theta) * Math.sin(phi);
            spatialCoords[idx * 3 + 2] = Math.cos(phi);
            randomPhases[idx] = Math.random();
            colorTypes[idx] = Math.random();
            types[idx] = i < 350 ? 1.0 : 0.0;
            const u = Math.random(), v = Math.random();
            const thetaD = u * 2 * Math.PI;
            const phiD = Math.acos(2 * v - 1);
            const speed = Math.random() * 0.36 + 0.12;
            drifts[idx * 3] = speed * Math.sin(phiD) * Math.cos(thetaD);
            drifts[idx * 3 + 1] = speed * Math.sin(phiD) * Math.sin(thetaD);
            drifts[idx * 3 + 2] = speed * Math.cos(phiD);
        }

        structuralGeometry.setAttribute('position', new THREE.BufferAttribute(spatialCoords, 3));
        structuralGeometry.setAttribute('pRandomPhase', new THREE.BufferAttribute(randomPhases, 1));
        structuralGeometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
        structuralGeometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 3));
        structuralGeometry.setAttribute('aColorType', new THREE.BufferAttribute(colorTypes, 1));
    }

    const clusterMaterial = new THREE.ShaderMaterial({
        vertexShader: dynamicVertexStage,
        fragmentShader: dynamicFragmentStage,
        uniforms: {
            uTimeline: { value: 0 }, uMirrorProgress: { value: 0 }, uShellRadius: { value: 0.5 },
            uBurnProgress: { value: 0 }, uClearProgress: { value: 0 }, uGlobalAlpha: { value: 0 },
            uAspect: { value: V.aspect },
            uForceField: { value: 0 },
            uBreathIntensity: { value: 0.035 },
            uParticleSize: { value: 28.98 },
            /* 0 = settled. The entrance sets it to 1 and animates back down;
               left at 0 the shader's converge term is inert. */
            uConverge: { value: 0 }
        },
        transparent: true,
        depthWrite: false
    });
    const orbPoints = new THREE.Points(structuralGeometry, clusterMaterial);
    orbPoints.frustumCulled = false;
    orbScene.add(orbPoints);

    /* ---- folder carousel ---- */
    const FOLDER_FOV = 45;
    const FOLDER_CAM_Z = 80;
    const carouselScene = new THREE.Scene();
    const carouselCam = new THREE.PerspectiveCamera(FOLDER_FOV, V.aspect, 0.1, 2000);
    carouselCam.position.set(0, 0, FOLDER_CAM_Z);

    let envRT = null;
    function rebuildFolderEnvironment() {
        if (envRT) envRT.dispose();
        const pmrem = new THREE.PMREMGenerator(renderer);
        envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        carouselScene.environment = envRT.texture;
        pmrem.dispose();
    }
    rebuildFolderEnvironment();

    carouselScene.add(new THREE.AmbientLight(0xffffff, 1.044));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.74);
    dirLight.position.set(10, 20, 30);
    carouselScene.add(dirLight);
    const pointLight1 = new THREE.PointLight(0xffffff, 3.48, 100); pointLight1.position.set(0, 10, 20); carouselScene.add(pointLight1);
    const pointLight2 = new THREE.PointLight(0xf0f0f0, 1.74, 100); pointLight2.position.set(-20, -10, -20); carouselScene.add(pointLight2);

    function createRoundedRect(x, y, w, h, rx, ry) {
        const shape = new THREE.Shape();
        shape.moveTo(x + rx, -y); shape.lineTo(x + w - rx, -y); shape.quadraticCurveTo(x + w, -y, x + w, -(y + ry));
        shape.lineTo(x + w, -(y + h - ry)); shape.quadraticCurveTo(x + w, -(y + h), x + w - rx, -(y + h));
        shape.lineTo(x + rx, -(y + h)); shape.quadraticCurveTo(x, -(y + h), x, -(y + h - ry));
        shape.lineTo(x, -(y + ry)); shape.quadraticCurveTo(x, -y, x + rx, -y);
        return shape;
    }

    function parseSVGPath(pathStr) {
        const shape = new THREE.Shape();
        const regex = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/g;
        const tokens = []; let match;
        while ((match = regex.exec(pathStr)) !== null) {
            if (match[1]) tokens.push(match[1]); else tokens.push(parseFloat(match[2]));
        }
        let i = 0, cx = 0, cy = 0, cmd = '';
        while (i < tokens.length) {
            if (isNaN(parseFloat(tokens[i]))) cmd = tokens[i++];
            switch (cmd) {
                case 'M': cx = tokens[i++]; cy = tokens[i++]; shape.moveTo(cx, -cy); cmd = 'L'; break;
                case 'H': cx = tokens[i++]; shape.lineTo(cx, -cy); break;
                case 'L': cx = tokens[i++]; cy = tokens[i++]; shape.lineTo(cx, -cy); break;
                case 'l': cx += tokens[i++]; cy += tokens[i++]; shape.lineTo(cx, -cy); break;
                case 'c': {
                    const dx1 = tokens[i++], dy1 = tokens[i++], dx2 = tokens[i++], dy2 = tokens[i++], dx3 = tokens[i++], dy3 = tokens[i++];
                    shape.bezierCurveTo(cx + dx1, -(cy + dy1), cx + dx2, -(cy + dy2), cx + dx3, -(cy + dy3));
                    cx += dx3; cy += dy3; break;
                }
                case 'Z': case 'z': shape.closePath(); break;
                default: i++; break;
            }
        }
        return shape;
    }

    /* `transparent: true` stays despite looking redundant alongside
       `transmission` — with it false, three.js forces output alpha to 1,
       discarding both this material's opacity and the thaw shader's
       diffuseColor.a override. Removing it would visibly change the glass. */
    function createGlassMaterial(isFront) {
        const mat = new THREE.MeshPhysicalMaterial({
            color: isFront ? 0xb5b5b5 : 0xcacaca,
            metalness: 0.1,
            roughness: 0.666,
            transmission: 0.65,
            ior: 1.305,
            thickness: isFront ? 10.0 : 15.0,
            transparent: true,
            opacity: isFront ? 0.756 : 0.98,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });

        /* Unconditional: the glass folders compile the thaw shader on every
           device. There is no reduced material variant any more. */
        {
            mat.onBeforeCompile = (shader) => {
                shader.vertexShader = `
                    attribute float aThaw;
                    varying float vThaw;
                    varying vec3 vLocalPos;
                    ${shader.vertexShader}
                `.replace(`#include <begin_vertex>`, `#include <begin_vertex>\nvLocalPos = position;\nvThaw = aThaw;`);

                shader.fragmentShader = `
                    varying float vThaw;
                    varying vec3 vLocalPos;
                    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                    float snoise(vec3 v) {
                        const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                        vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
                        vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
                        vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
                        i = mod289(i);
                        vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                        float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
                        vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
                        vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
                        vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw); vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0;
                        vec4 sh = -step(h, vec4(0.0)); vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                        vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
                        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
                        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                    }
                    ${shader.fragmentShader}
                `.replace(`void main() {`, `void main() {\nfloat noiseVal = snoise(vLocalPos * 0.006) * 0.5 + 0.5;\nfloat thawMask = smoothstep(noiseVal - 0.25, noiseVal + 0.25, vThaw);`)
                 .replace(`#include <roughnessmap_fragment>`, `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.15, thawMask * 0.9);`)
                 .replace(`#include <color_fragment>`, `#include <color_fragment>\ndiffuseColor.a = mix(diffuseColor.a, 0.25, thawMask * 0.85);`);
            };
        }
        return mat;
    }

    const extrudeSettings = { depth: 6, bevelEnabled: true, bevelSegments: 4, steps: 2, bevelSize: 1.5, bevelThickness: 1.5 };
    const fileExtrudeSettings = { depth: 2, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 1, bevelThickness: 1 };

    const sharedFrontMat = createGlassMaterial(true);
    const sharedBackMat = createGlassMaterial(false);
    const fileMat1 = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6, metalness: 0.1 });
    const fileMat2 = new THREE.MeshStandardMaterial({ color: 0x989491, roughness: 0.6, metalness: 0.1 });
    const fileMat3 = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.6, metalness: 0.1 });

    const backGeo = new THREE.ExtrudeGeometry(createRoundedRect(33.33, 0, 642.73, 526.08, 50.49, 50.49), extrudeSettings);
    backGeo.center();
    const fileGeo = new THREE.ExtrudeGeometry(createRoundedRect(0, 0, 345.17, 443.33, 29.3, 29.3), fileExtrudeSettings);
    const frontGeo = new THREE.ExtrudeGeometry(parseSVGPath("M617.68,533.23H94.07c-46.21,0-69.77-17.21-70.26-62.81-.01-.97-.05-1.94-.12-2.91L.13,170.68c-.09-1.11-.13-2.24-.13-3.35.08-45.49,3.86-64.97,49.99-64.97l290.42-2.38c35.71-2.38,59.51,90.46,104.74,92.84,57.1,3.01,168.89-1.13,221.38,4.76,8.94,1,15.7,3.69,20.93,6.96,10.53,6.59,17.27,17.85,18.64,30.2l.44,3.99c.3,2.71.33,5.45.1,8.17l-18.55,213.31c-.09,1.07-.14,2.15-.15,3.22-.54,45.65-24.1,69.8-70.26,69.8Z"), extrudeSettings);

    const thawArray = new Float32Array(5);
    const thawAttribute = new THREE.InstancedBufferAttribute(thawArray, 1);
    thawAttribute.setUsage(THREE.DynamicDrawUsage);
    frontGeo.setAttribute('aThaw', thawAttribute);
    backGeo.setAttribute('aThaw', thawAttribute);

    const frontIM = new THREE.InstancedMesh(frontGeo, sharedFrontMat, 5);
    const backIM = new THREE.InstancedMesh(backGeo, sharedBackMat, 5);
    const file1IM = new THREE.InstancedMesh(fileGeo, fileMat1, 5);
    const file2IM = new THREE.InstancedMesh(fileGeo, fileMat2, 5);
    const file3IM = new THREE.InstancedMesh(fileGeo, fileMat3, 5);
    [frontIM, backIM, file1IM, file2IM, file3IM].forEach(im => {
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    });

    const folders = [], hitBoxes = [];
    const carouselGroup = new THREE.Group();
    carouselScene.add(carouselGroup);
    carouselGroup.add(frontIM, backIM, file1IM, file2IM, file3IM);

    const hitBoxGeo = new THREE.BoxGeometry(750, 600, 100);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const centerX = 706.8 / 2, centerY = -533.23 / 2;

    const folderNames = ["Naivaa", "A Thousand Islands", "Digital Art", "Graphic Design", "Mind Map"];
    const PROJECT_INDEX = { "Naivaa": 0, "A Thousand Islands": 1, "Graphic Design": 2, "Digital Art": 3, "Mind Map": 99 };

    const labelsContainer = document.getElementById('labels-container');
    const labels = folderNames.map(name => {
        const el = document.createElement('div');
        el.className = 'folder-label';
        el.textContent = name;
        labelsContainer.appendChild(el);
        return el;
    });

    function createFolderSkeleton(index) {
        const folderGroup = new THREE.Group();
        const centeringGroup = new THREE.Group();
        centeringGroup.position.set(-centerX, -centerY, 0);
        folderGroup.add(centeringGroup);

        const backDummy = new THREE.Object3D(); backDummy.position.set(centerX, centerY, -15); centeringGroup.add(backDummy);

        const file1Group = new THREE.Group(); file1Group.position.set(-34.57, -42.37, -5); file1Group.rotation.z = 8.69 * Math.PI / 180;
        const file1Dummy = new THREE.Object3D(); file1Dummy.position.set(88.8, -26.9, 0); file1Group.add(file1Dummy); centeringGroup.add(file1Group);

        const file2Group = new THREE.Group(); file2Group.position.set(0, 0, 2);
        const file2Dummy = new THREE.Object3D(); file2Dummy.position.set(189.19, -25.72, 0); file2Group.add(file2Dummy); centeringGroup.add(file2Group);

        const file3Group = new THREE.Group(); file3Group.position.set(68.83, 93.24, 9); file3Group.rotation.z = -12.61 * Math.PI / 180;
        const file3Dummy = new THREE.Object3D(); file3Dummy.position.set(283.9, -43.32, 0); file3Group.add(file3Dummy); centeringGroup.add(file3Group);

        const frontHinge = new THREE.Group(); frontHinge.position.set(0, -533.23, 20);
        const frontDummy = new THREE.Object3D(); frontDummy.position.set(0, 533.23, 0); frontHinge.add(frontDummy); centeringGroup.add(frontHinge);

        const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
        hitBox.position.set(centerX, centerY, 0);
        centeringGroup.add(hitBox);

        folderGroup.userData = {
            index, isHovered: false, thaw: 0, currentAngle: 0.15,
            dummies: { back: backDummy, front: frontDummy, f1: file1Dummy, f2: file2Dummy, f3: file3Dummy },
            files: [file1Dummy, file2Dummy, file3Dummy],
            fileGroups: [file1Group, file2Group, file3Group],
            hinge: frontHinge, phaseOffset: Math.random() * Math.PI * 2,
            fileState: 0, fileLifts: [0, 0, 0], fileVels: [0, 0, 0], transitionStart: -999
        };
        hitBox.userData = { folder: folderGroup };
        hitBoxes.push(hitBox);
        return folderGroup;
    }

    for (let i = 0; i < 5; i++) {
        const f = createFolderSkeleton(i);
        folders.push(f);
        carouselGroup.add(f);
    }

    const folderPreviews = createFolderPreviews({ THREE, folders, createRoundedRect });

    /* ---- Scene 1 responsive sizing ---- */
    const Scene1Layout = {
        orbRadius: 0.5,
        particleSize: 28.98,
        breath: 0.035,
        orbOffsetY: 0,
        entranceY: -110,
        carouselRadius: 1248
    };

    function layoutScene1() {
        orbCam.aspect = V.aspect;
        orbCam.updateProjectionMatrix();
        carouselCam.aspect = V.aspect;
        carouselCam.updateProjectionMatrix();

        renderer.setPixelRatio(Governor.ratioFor());
        renderer.setSize(V.width, V.height, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';

        clusterMaterial.uniforms.uAspect.value = V.aspect;

        const orbView = visibleSizeAt(ORB_CAM_Z, ORB_FOV);
        const constraining = Math.min(orbView.w, orbView.h);
        const fillFraction = mix(0.70, 0.31, V.t);
        Scene1Layout.orbRadius = (fillFraction * constraining) / 2;
        Scene1Layout.particleSize = mix(20.0, 28.98, V.t);
        Scene1Layout.breath = mix(0.037476, 0.0347, V.t);
        Scene1Layout.orbOffsetY = orbView.h * 0.04 * (1 - V.t);

        clusterMaterial.uniforms.uShellRadius.value = Scene1Layout.orbRadius;
        clusterMaterial.uniforms.uParticleSize.value = Scene1Layout.particleSize;
        clusterMaterial.uniforms.uBreathIntensity.value = Scene1Layout.breath;
        orbScene.position.y = Scene1Layout.orbOffsetY;

        const folderView = visibleSizeAt(FOLDER_CAM_Z, FOLDER_FOV);
        const folderMin = Math.min(folderView.w, folderView.h);
        const folderFill = mix(0.9775, 0.81, V.t);
        const s = (folderMin * folderFill) / 3000;
        carouselGroup.scale.set(s, s, s);

        Scene1Layout.entranceY = -folderView.h * 1.66;
        entranceState.targetY = mix(Scene1Layout.entranceY, 0, lastCarouselEntrance);
    }

    /* ---- Scene 1 state ---- */
    let isSystemLocked = true, organicSwayFactor = 0;
    let displayScrollProgress = 0, targetScrollProgress = 0;
    let transitionState = 'IDLE', pendingFolder = null;
    let lastCarouselEntrance = 0;
    const entranceState = { posY: -110, targetY: -110, velY: 0 };
    const angleStep = (Math.PI * 2) / 5;
    let targetRotation = 0, currentRotation = 0, isDragging = false;
    let startX = 0, startY = 0, previousX = 0, dragVelocity = 0;
    let carouselDragging = false, carouselPrevX = 0;
    let currentForceField = 0;
    const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();

    const VirtualScroll = { raw: 0, max: V.height * 1.5 };

    const tempV = new THREE.Vector3();
    const inverseCarouselMatrix = new THREE.Matrix4();
    const tempMat = new THREE.Matrix4();

    const labelCache = Array.from({ length: 5 }, () => ({ x: -9999, y: -9999, focus: false, hover: false, lastT: '' }));

    /* FIX 7 — boot fade driven by the render loop, not setInterval.
       The old code ran a 30ms setInterval for 1.5s alongside a 16.7ms rAF. Two
       independent clocks at non-harmonic rates produce visible beat-frequency
       jitter during the exact window the user is forming their first impression. */
    let bootFade = { active: false, t: 0, duration: 1.5 };
    /* Entrance convergence clock — see frameScene1. Longer than bootFade so
       the particles are still arriving as they finish fading in. */
    let converge = { active: false, t: 0, duration: 2.6 };

    /* ---- typewriter ---- */
    const homeBtn = document.getElementById('home-btn');
    const contactBtn = document.getElementById('contact-btn');
    const scrollText = document.getElementById('scroll-text');
    const swipeText = document.getElementById('swipe-text');
    const welcomeTitle = document.getElementById('welcome-title');
    const mmInteractText = document.getElementById('mindmap-interact-text');

    const fullText = "Welcome to my Vault";
    let typeTimeout, wasScrolled = false, hasSwiped = false;

    function startTypewriter() {
        clearTimeout(typeTimeout);
        welcomeTitle.textContent = '';
        welcomeTitle.classList.remove('done');
        if (REDUCED_MOTION) {
            welcomeTitle.textContent = fullText;
            welcomeTitle.classList.add('done');
            return;
        }
        let i = 0;
        (function typeChar() {
            if (i < fullText.length) {
                welcomeTitle.textContent += fullText.charAt(i++);
                typeTimeout = setTimeout(typeChar, 65);
            } else {
                welcomeTitle.classList.add('done');
            }
        })();
    }

    const mmFullText = "Step into My Mind";
    let mmTypeTimeout, mmFadeTimeout;
    const mmWelcomeTitle = document.getElementById('mindmap-welcome-title');

    function startMindMapTypewriter() {
        clearTimeout(mmTypeTimeout);
        clearTimeout(mmFadeTimeout);
        mmWelcomeTitle.textContent = '';
        mmWelcomeTitle.classList.remove('done');
        mmWelcomeTitle.style.opacity = 1;

        mmInteractText.textContent = "Touch to interact";
        mmInteractText.classList.remove('hidden');
        mmInteractText.classList.add('fade-in');

        const finish = () => {
            mmWelcomeTitle.classList.add('done');
            mmFadeTimeout = setTimeout(() => { mmWelcomeTitle.style.opacity = 0; }, 10000);
        };

        if (REDUCED_MOTION) { mmWelcomeTitle.textContent = mmFullText; finish(); return; }
        let i = 0;
        (function typeChar() {
            if (i < mmFullText.length) {
                mmWelcomeTitle.textContent += mmFullText.charAt(i++);
                mmTypeTimeout = setTimeout(typeChar, 65);
            } else finish();
        })();
    }

    function resetMindMapTypewriter() {
        clearTimeout(mmTypeTimeout);
        clearTimeout(mmFadeTimeout);
        mmWelcomeTitle.style.opacity = 0;
        mmWelcomeTitle.textContent = '';
        mmInteractText.classList.remove('fade-in');
        mmInteractText.classList.add('hidden');
    }

    function hideInteractText() {
        if (!mmInteractText.classList.contains('hidden')) mmInteractText.classList.add('hidden');
    }

    homeBtn.addEventListener('click', () => {
        /* Home is the Profile page now, not the top of the orb scene. The Vault
           is still wound back underneath so the next entry replays the full
           arrival rather than dropping the visitor mid-scroll. */
        returningToHomepage = true;
        isDragging = false;
        beginTransition();
        if (Router.scene !== 1) returnToSceneOne();
        else resetVaultToOrb();
        Homepage.show();
    });

    /* ---- Scene 1 frame ---- */
    function triggerFolderClose() {
        if (pendingFolder) pendingFolder.userData.transitionStart = Loop.time;
        transitionState = 'IDLE';
    }

    function triggerFolderOpenSequence(folder, projectIndex) {
        transitionState = 'OPENING';
        Router.forceField = 1.0;
        const id = beginTransition();
        setTimeout(() => {
            if (!isCurrentTransition(id)) return;
            openCollectionFromFolder(projectIndex, id);
        }, 1050);
    }

    function applyVirtualScroll(deltaY) {
        if (transitionState !== 'IDLE') return;
        const prev = VirtualScroll.raw;
        VirtualScroll.raw = clamp(VirtualScroll.raw + deltaY, 0, VirtualScroll.max);
        let p = VirtualScroll.raw / VirtualScroll.max;

        if (deltaY > 0 && p > 0.40 && (prev / VirtualScroll.max) <= 0.40) {
            VirtualScroll.raw = VirtualScroll.max;
            p = 1.0;
        }
        targetScrollProgress = p;

        if (p > 0.02) {
            scrollText.style.opacity = 0;
            welcomeTitle.style.opacity = 0;
            wasScrolled = true;
            clearTimeout(typeTimeout);
        } else {
            scrollText.style.opacity = 1;
            if (wasScrolled) {
                wasScrolled = false;
                welcomeTitle.style.opacity = 1;
                startTypewriter();
            }
        }
    }

    function frameScene1(dt, time) {
        /* FIX 7 */
        if (bootFade.active) {
            bootFade.t = Math.min(1, bootFade.t + dt / bootFade.duration);
            clusterMaterial.uniforms.uGlobalAlpha.value = smoothstep(0, 1, bootFade.t);
            if (bootFade.t >= 1) bootFade.active = false;
        }

        /* Converge entrance — particles fly in and form the sphere. Runs on
           its own slightly longer clock than bootFade so the particles are
           still visibly settling as they finish fading in, then holds at 0
           forever after (the shader term is inert at 0). */
        if (converge.active) {
            converge.t = Math.min(1, converge.t + dt / converge.duration);
            const eased = 1 - Math.pow(1 - converge.t, 3);   // ease-out cubic
            clusterMaterial.uniforms.uConverge.value = 1 - eased;
            if (converge.t >= 1) {
                clusterMaterial.uniforms.uConverge.value = 0;
                converge.active = false;
            }
        }

        currentForceField = THREE.MathUtils.lerp(currentForceField, Router.forceField, 0.05);
        clusterMaterial.uniforms.uForceField.value = currentForceField;

        const isSnapping = (targetScrollProgress === 1.0 && displayScrollProgress < 0.99) ||
                           (targetScrollProgress <= 0.40 && displayScrollProgress > 0.41);
        displayScrollProgress = THREE.MathUtils.lerp(displayScrollProgress, targetScrollProgress, isSnapping ? 0.125 : 0.04);

        clusterMaterial.uniforms.uTimeline.value = time;
        clusterMaterial.uniforms.uBurnProgress.value = smoothstep(0.0, 0.5, displayScrollProgress);

        const carouselEntrance = smoothstep(0.10, 1.0, displayScrollProgress);
        lastCarouselEntrance = carouselEntrance;
        clusterMaterial.uniforms.uClearProgress.value = carouselEntrance;

        entranceState.targetY = mix(Scene1Layout.entranceY, 0, carouselEntrance);
        const prevPosY = entranceState.posY;

        const speedBoost = mix(5.0, 1.0, V.t);
        const lerpMin = (isSnapping ? 0.048 : 0.03125) * speedBoost;
        const lerpMax = (isSnapping ? 0.173 : 0.1109) * speedBoost;
        const span = Math.max(1e-3, Math.abs(Scene1Layout.entranceY));
        entranceState.posY = THREE.MathUtils.lerp(
            entranceState.posY,
            entranceState.targetY,
            clamp(mix(lerpMin, lerpMax, Math.abs(entranceState.targetY - entranceState.posY) / span), 0, 1)
        );
        entranceState.velY = entranceState.posY - prevPosY;
        carouselGroup.position.y = entranceState.posY;

        isSystemLocked = carouselEntrance < 0.99 || Math.abs(entranceState.velY) > 0.1;

        if (isSystemLocked) {
            currentRotation = 0; targetRotation = 0;
            organicSwayFactor = Math.max(0, organicSwayFactor - 0.05);
        } else {
            if (transitionState === 'IDLE' || transitionState === 'CENTERING' || transitionState === 'CENTERING_TO_OPEN' || transitionState === 'OPENING') {
                let rotLerp = mix(0.375, 0.075, V.t);
                if (transitionState === 'CENTERING_TO_OPEN') rotLerp = mix(0.45, 0.22, V.t);
                currentRotation = THREE.MathUtils.lerp(currentRotation, targetRotation, rotLerp);
                organicSwayFactor = Math.min(1, organicSwayFactor + 0.02);
            } else {
                organicSwayFactor = Math.max(0, organicSwayFactor - 0.05);
            }
        }

        if (displayScrollProgress < 0.1) hasSwiped = false;
        swipeText.style.opacity = (displayScrollProgress > 0.95 && !hasSwiped && transitionState === 'IDLE') ? 1 : 0;

        if (transitionState === 'CENTERING_TO_OPEN' && pendingFolder) {
            folders.forEach(f => f.userData.isHovered = false);
            if (Math.abs(currentRotation - targetRotation) < 0.02) {
                const pIdx = PROJECT_INDEX[folderNames[pendingFolder.userData.index]];
                if (pIdx !== undefined) triggerFolderOpenSequence(pendingFolder, pIdx);
                else { transitionState = 'IDLE'; pendingFolder = null; }
            }
        } else if (transitionState === 'CENTERING' && pendingFolder) {
            folders.forEach(f => f.userData.isHovered = false);
            if (Math.abs(currentRotation - targetRotation) < 0.02) { transitionState = 'IDLE'; pendingFolder = null; }
        }

        carouselGroup.updateMatrixWorld(true);
        inverseCarouselMatrix.copy(carouselGroup.matrixWorld).invert();

        folders.forEach((folder, i) => {
            let wrappedTheta = (((currentRotation + i * angleStep) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            if (wrappedTheta > Math.PI) wrappedTheta -= Math.PI * 2;

            const R = Scene1Layout.carouselRadius;
            folder.position.x = Math.sin(wrappedTheta) * R;
            folder.position.z = Math.cos(wrappedTheta) * R - R;
            folder.rotation.y = Math.abs(wrappedTheta) < 1.8
                ? clamp(wrappedTheta, -0.7, 0.7)
                : THREE.MathUtils.lerp(Math.sign(wrappedTheta) * 0.7, wrappedTheta, clamp((Math.abs(wrappedTheta) - 1.8) / 0.4, 0, 1));

            const phase = folder.userData.phaseOffset;
            folder.position.y = Math.sin(time * 1.2 + phase) * 0.7828 * organicSwayFactor;
            folder.rotation.z = Math.sin(time * 0.9 + phase) * 0.010815 * organicSwayFactor;
            folder.rotation.x = Math.cos(time * 0.7 + phase) * 0.010815 * organicSwayFactor;

            let targetThaw = 0, targetFlapAngle = 0.15;
            const isPending = (transitionState === 'OPENING' && folder === pendingFolder);

            if (!isSystemLocked) {
                if (isPending) {
                    targetThaw = 1.0;
                    targetFlapAngle = 1.2;
                } else if (transitionState === 'IDLE') {
                    if (window.matchMedia('(hover: hover)').matches) {
                        targetThaw = folder.userData.isHovered ? 1.0 : 0.0;
                        targetFlapAngle = folder.userData.isHovered ? 0.65 : 0.15;
                    } else if (Math.abs(wrappedTheta) < 0.25) {
                        targetThaw = Math.max(0, 1.0 - Math.abs(wrappedTheta) / 0.25);
                        targetFlapAngle = 0.15 + 0.5 * targetThaw;
                    }
                }
            }

            folder.userData.thaw = THREE.MathUtils.lerp(folder.userData.thaw, targetThaw, 0.08);
            thawArray[i] = folder.userData.thaw;

            folder.userData.currentAngle = THREE.MathUtils.lerp(folder.userData.currentAngle, targetFlapAngle, 0.08);
            folder.userData.hinge.rotation.x = folder.userData.currentAngle;

            const targetFileState = isPending ? 1 : 0;
            if (folder.userData.fileState !== targetFileState) {
                folder.userData.fileState = targetFileState;
                folder.userData.transitionStart = time;
            }

            const dipAmount = 25, liftAmount = 480;
            for (let j = 0; j < 3; j++) {
                let targetLift = 0, tension = 0.04, friction = 0.8;

                if (folder.userData.fileState === 1) {
                    const localElapsed = time - folder.userData.transitionStart - j * 0.0625;
                    if (localElapsed < 0) targetLift = 0;
                    else if (localElapsed < 0.134) { targetLift = -dipAmount; tension = 0.1568; friction = 0.68; }
                    else { targetLift = liftAmount; tension = 0.01568; friction = 0.86; }
                } else {
                    const localElapsed = time - folder.userData.transitionStart - (2 - j) * 0.0625;
                    if (localElapsed < 0) targetLift = liftAmount;
                    else { targetLift = 0; tension = 0.01904; friction = 0.83; }
                }

                folder.userData.fileVels[j] += (targetLift - folder.userData.fileLifts[j]) * tension;
                folder.userData.fileVels[j] *= friction;
                folder.userData.fileLifts[j] += folder.userData.fileVels[j];
            }

            folder.userData.fileGroups[0].position.set(-34.57, -42.37 + folder.userData.fileLifts[0], -5);
            folder.userData.fileGroups[1].position.set(0, folder.userData.fileLifts[1], 2);
            folder.userData.fileGroups[2].position.set(68.83, 93.24 + folder.userData.fileLifts[2], 9);

            folder.userData.files[0].position.y = -26.9 + Math.sin(time * 2.0 + 0.0 + i) * 4.4805 * organicSwayFactor;
            folder.userData.files[1].position.y = -25.72 + Math.sin(time * 2.0 + 1.5 + i) * 4.4805 * organicSwayFactor;
            folder.userData.files[2].position.y = -43.32 + Math.sin(time * 2.0 + 3.0 + i) * 4.4805 * organicSwayFactor;

            folder.updateMatrixWorld(true);

            const setIM = (dummy, im) => {
                tempMat.copy(dummy.matrixWorld).premultiply(inverseCarouselMatrix);
                im.setMatrixAt(i, tempMat);
            };
            setIM(folder.userData.dummies.front, frontIM);
            setIM(folder.userData.dummies.back, backIM);
            setIM(folder.userData.dummies.f1, file1IM);
            setIM(folder.userData.dummies.f2, file2IM);
            setIM(folder.userData.dummies.f3, file3IM);

            tempV.set(0, -385, 0);
            tempV.applyMatrix4(folder.matrixWorld);
            tempV.project(carouselCam);

            const cache = labelCache[i];
            cache.x = (tempV.x * 0.5 + 0.5) * V.width;
            cache.y = -(tempV.y * 0.5 - 0.5) * V.height;
            cache.focus = Math.abs(wrappedTheta) < 0.25 && carouselEntrance > 0.5;
            cache.hover = folder.userData.isHovered;

            /* TIER 2 INTENT SIGNAL.
               A centred or hovered folder predicts the next click 1-3s early.

               CHANGED: the mind map's intent signal now only warms the HTTP cache
               (Scene3.prefetch). It no longer builds a WebGL context, decodes
               textures or allocates GPU memory — that all happens in Scene3.mount()
               when the user actually commits to entering. */
            if ((cache.focus || cache.hover) && !isSystemLocked) {
                const pIdx = PROJECT_INDEX[folderNames[i]];
                if (pIdx === 99) Scene3.prefetch();
                else if (pIdx !== undefined) Assets.prefetchProject(pIdx);
            }

            const label = labels[i];
            const t = `translate(-50%, -50%) translate3d(${cache.x.toFixed(1)}px, ${cache.y.toFixed(1)}px, 0)`;
            if (t !== cache.lastT) { label.style.transform = t; cache.lastT = t; }
            if (cache.focus !== label._focus) { label.classList.toggle('focus', cache.focus); label._focus = cache.focus; }
            if (cache.hover !== label._hover) { label.classList.toggle('hover', cache.hover); label._hover = cache.hover; }
        });

        thawAttribute.needsUpdate = true;
        frontIM.instanceMatrix.needsUpdate = true;
        backIM.instanceMatrix.needsUpdate = true;
        file1IM.instanceMatrix.needsUpdate = true;
        file2IM.instanceMatrix.needsUpdate = true;
        file3IM.instanceMatrix.needsUpdate = true;

        renderer.clear();
        renderer.render(orbScene, orbCam);
        renderer.clearDepth();
        renderer.render(carouselScene, carouselCam);
    }

    Loop.register(1, frameScene1);

    /* ==========================================================================
       8. SCENE 3 — MIND MAP (lazily mounted/unmounted). Renderer, context,
       controls, geometry and textures created in mount(), destroyed in
       unmount() — previously module-eval time, standing ~40MB + a second
       WebGL context for every visitor regardless of use. Tiles load as KTX2
       when available (~22MB total vs ~106MB RGBA8+mips), falling back
       per-file to ImageBitmap if missing.
       ========================================================================== */

    /* ---- BUILD STEP FOR THE COMPRESSED PATH ----
       Optional (falls back to source images if skipped).
       1. `toktx --encode uastc --uastc_quality 2 --genmipmap --zcmp 18
          --resize 512x512 --assign_oetf srgb out.ktx2 in.jpg`
       2. Self-host assets/vendor/basis/basis_transcoder.{js,wasm} from
          unpkg.com/three@0.160.0/.../libs/basis/ — CDN fallback if missing.
       Verify: DevTools Network "ktx2" filter, or console tile-count summary. */
    const Scene3 = createMindMap({ THREE, OrbitControls, KTX2Loader, V, renderer, Governor, guardContext, Assets, Idle, Loop, REDUCED_MOTION, gsap, clamp, mix });

    /* ==========================================================================
       8b. PULSE — hand-tracking input, additional not replacement: calls the
       same public entries as mouse/touch, so Mind Map physics are untouched.
       setPointer is fed the screen centre continuously (no hand-mapped
       cursor), so the existing raycast focuses whatever tile faces the
       viewer; hand position only controls rotation via frame delta while
       pinching. MediaPipe lazy-loads on first activation, ~15fps capture
       smoothed to 60fps. State: OFF->NOTICE->FRAME->LEARN->LIVE, DENIED a
       side-branch; flags in-memory only, per page load.
       ========================================================================== */
    const Pulse = createPulse({ Scene3, Router, clamp });

    /* ==========================================================================
       9. ROUTING — each scene transition takes a monotonic id; every
       deferred callback bails if a newer transition has started, since the
       old chain of uncancelled setTimeouts could let one fire mid-transition
       and overwrite state that had already moved on.
       ========================================================================== */
    let transitionId = 0;
    function beginTransition() { return ++transitionId; }
    function isCurrentTransition(id) { return id === transitionId; }

    const sceneOneEl = document.getElementById('scene-one');
    const sceneTwoEl = document.getElementById('scene-two');
    const sceneThreeEl = document.getElementById('scene-three');
    const backBtn2 = document.getElementById('scene-two-back-btn');
    const backBtn3 = document.getElementById('scene-three-back-btn');

    function openCollectionFromFolder(projectIndex, id) {
        if (id !== undefined && !isCurrentTransition(id)) return;
        const tid = id !== undefined ? id : beginTransition();
        Assets.cancelPending();

        sceneOneEl.style.opacity = '0';
        sceneOneEl.style.pointerEvents = 'none';

        if (projectIndex === 99) {
            Router.scene = 3;
            Scene3.mount();
            Governor.refresh('scene3');
            setTimeout(() => {
                if (!isCurrentTransition(tid)) return;
                sceneThreeEl.style.opacity = '1';
                sceneThreeEl.style.pointerEvents = 'auto';
                backBtn3.classList.add('active');
                startMindMapTypewriter();
                Pulse.revealToggleOnce();
            }, 800);
        } else {
            Router.scene = 2;
            setTimeout(() => {
                if (!isCurrentTransition(tid)) return;
                sceneTwoEl.style.opacity = '1';
                sceneTwoEl.style.pointerEvents = 'auto';
                backBtn2.classList.add('active');
                S2.load(projectIndex);
            }, 800);
        }
    }

    /* Explicitly asserts the homepage's post-return state rather than
       assuming pre-navigation values survived — the old version relied on
       several scroll/entrance variables holding steady, and anything that
       perturbed them mid-transition left the scene drifting back toward the
       particle orb instead of the folder carousel. */
    function restoreCarouselState() {
        VirtualScroll.max = V.height * 1.5;
        VirtualScroll.raw = VirtualScroll.max;

        targetScrollProgress = 1;
        displayScrollProgress = 1;
        lastCarouselEntrance = 1;

        entranceState.posY = 0;
        entranceState.targetY = 0;
        entranceState.velY = 0;

        isSystemLocked = false;
        wasScrolled = true;

        /* Snap rotation to a whole folder so we never land between detents. */
        targetRotation = Math.round(targetRotation / angleStep) * angleStep;
        currentRotation = targetRotation;

        carouselGroup.position.y = 0;

        /* Uniforms that are normally driven by the scroll progress. */
        clusterMaterial.uniforms.uBurnProgress.value = smoothstep(0.0, 0.5, 1);
        clusterMaterial.uniforms.uClearProgress.value = 1;

        scrollText.style.opacity = 0;
        welcomeTitle.style.opacity = 0;
    }

    /* The mirror of restoreCarouselState: wind Scene 1 all the way back to its
       pre-entrance state so the next "Enter The Vault" replays the full arrival
       instead of resuming wherever the visitor happened to leave off. */
    function resetVaultToOrb() {
        entranceToken++;   /* cancel any entrance timers still in flight */

        VirtualScroll.max = V.height * 1.5;
        VirtualScroll.raw = 0;

        targetScrollProgress = 0;
        displayScrollProgress = 0;
        lastCarouselEntrance = 0;

        entranceState.posY = Scene1Layout.entranceY;
        entranceState.targetY = Scene1Layout.entranceY;
        entranceState.velY = 0;
        carouselGroup.position.y = Scene1Layout.entranceY;

        isSystemLocked = true;
        wasScrolled = false;
        hasSwiped = false;
        isDragging = false;
        transitionState = 'IDLE';
        pendingFolder = null;

        targetRotation = 0;
        currentRotation = 0;

        clusterMaterial.uniforms.uBurnProgress.value = 0;
        clusterMaterial.uniforms.uClearProgress.value = 0;
        Router.forceField = 0;
        currentForceField = 0;

        clearTimeout(typeTimeout);
        welcomeTitle.textContent = '';
        welcomeTitle.style.opacity = 0;
        scrollText.style.opacity = 0;
        swipeText.style.opacity = 0;
    }

    /* Which of the two states returnToSceneOne restores depends on WHY we're
       leaving: Back means "return to the folder carousel", Home means "return
       to Profile, with the Vault reset behind it". */
    let returningToHomepage = false;
    function restoreVaultState() {
        if (returningToHomepage) resetVaultToOrb();
        else restoreCarouselState();
    }

    function returnToSceneOne() {
        const tid = beginTransition();
        const wasScene3 = Router.scene === 3;

        Router.scene = 1;
        if (S2.activeCluster !== -1) S2.close(true);
        resetMindMapTypewriter();
        Scene3.clearPointer();
        Pulse.disableForNavigation();
        Assets.cancelPending();
        Scene3.pausePreparation();

        sceneTwoEl.style.opacity = '0';
        sceneTwoEl.style.pointerEvents = 'none';
        sceneThreeEl.style.opacity = '0';
        sceneThreeEl.style.pointerEvents = 'none';
        backBtn2.classList.remove('active');
        backBtn3.classList.remove('active');

        restoreVaultState();
        Governor.refresh('scene1');

        setTimeout(() => {
            if (!isCurrentTransition(tid)) return;
            S2.unload();
            /* Tear the mind map's context down only after it has fully faded, so
               the user never sees the canvas vanish. */
            if (wasScene3) Scene3.unmount();
            sceneOneEl.style.opacity = '1';
            sceneOneEl.style.pointerEvents = 'auto';
            /* Re-assert: the 800ms fade is long enough for a resize to have
               recomputed the entrance geometry from stale values. */
            restoreVaultState();
            setTimeout(() => {
                if (!isCurrentTransition(tid)) return;
                Router.forceField = 0;
                triggerFolderClose();
            }, 100);
        }, 800);
    }

    /* Which of the two states we're headed to depends on why we're leaving:
       Back means "return to the folder carousel", Home means "return to
       Profile with the Vault reset behind it" (see restoreVaultState above). */
    function backToVault() { returningToHomepage = false; returnToSceneOne(); }
    backBtn2.addEventListener('click', backToVault);
    backBtn3.addEventListener('click', backToVault);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (Router.scene === 2 && S2.activeCluster !== -1) S2.close();
        else if (Router.scene !== 1) backToVault();
    });

    /* ==========================================================================
       10. INPUT — scoped, mostly-passive listeners. A prior global window
       {passive:false} wheel/touchmove forced JS before ANY scroll could run,
       including the compositor-driven grid scroller. Now: scene 1 (needs
       preventDefault) -> #scene-one non-passive; scene 2 carousel ->
       #click-blocker (display:none unless open, so the grid scroller never
       has a non-passive ancestor); scene 3 (reads only) -> passive.
       ========================================================================== */
    const blockerEl = document.getElementById('click-blocker');

    /* ---- Scene 1: wheel ---- */
    let wheelSnapTimeout;
    sceneOneEl.addEventListener('wheel', (e) => {
        if (Router.scene !== 1) return;
        e.preventDefault();
        if (!isSystemLocked && transitionState === 'IDLE' && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            targetRotation -= e.deltaX * 0.002;
            hasSwiped = true;
            clearTimeout(wheelSnapTimeout);
            wheelSnapTimeout = setTimeout(() => {
                targetRotation = Math.round(targetRotation / angleStep) * angleStep;
            }, 150);
            return;
        }
        applyVirtualScroll(e.deltaY);
    }, { passive: false });

    /* Scoped to #click-blocker only — it covers the carousel for the whole
       open->closing lifetime and sits above #dom-layer, so nothing inside
       #dom-layer can receive this event while it's active. */
    function onCarouselWheel(e) {
        if (Router.scene !== 2 || S2.activeCluster === -1) return;
        e.preventDefault();
        const delta = V.compact ? e.deltaY : e.deltaX;
        S2.applyCarouselDelta(delta);
    }
    blockerEl.addEventListener('wheel', onCarouselWheel, { passive: false });

    /* ---- Scene 1: touch ---- */
    let touchStartX = 0, touchStartY = 0, touchIntent = null;

    sceneOneEl.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchIntent = null;
    }, { passive: true });

    sceneOneEl.addEventListener('touchmove', (e) => {
        if (Router.scene !== 1) return;
        const cx = e.touches[0].clientX;
        const cy = e.touches[0].clientY;
        const dx = touchStartX - cx;
        const dy = touchStartY - cy;

        e.preventDefault();
        if (touchIntent === null) {
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) touchIntent = 'rotate';
            else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) touchIntent = 'scroll';
        }
        if (touchIntent === 'scroll') {
            isDragging = false;
            applyVirtualScroll(dy * mix(1.0, 1.5, V.t));
            touchStartY = cy;
            touchStartX = cx;
        }
    }, { passive: false });

    /* ---- Scene 2 carousel: touch ---- */
    let carTouchX = 0, carTouchY = 0;

    blockerEl.addEventListener('touchstart', (e) => {
        carTouchX = e.touches[0].clientX;
        carTouchY = e.touches[0].clientY;
    }, { passive: true });

    blockerEl.addEventListener('touchmove', (e) => {
        if (Router.scene !== 2 || S2.activeCluster === -1) return;
        e.preventDefault();
        const cx = e.touches[0].clientX;
        const cy = e.touches[0].clientY;
        S2.applyCarouselDelta((V.compact ? (carTouchY - cy) : (carTouchX - cx)) * 2.0);
        carTouchX = cx;
        carTouchY = cy;
    }, { passive: false });

    /* ---- Scene 3: touch (PASSIVE — OrbitControls handles its own gestures) ----
       Suppressed while Pulse is live, same as mouse below — both write the
       same setPointer/setPointerDown state Pulse writes every frame, which is
       what made the globe stutter when both ran at once. Touch stays silently
       blocked — it never triggers the notice, only a deliberate click on the
       sphere itself does (see handlePointerDown below). */
    sceneThreeEl.addEventListener('touchstart', (e) => {
        if (Router.scene !== 3) return;
        if (Scene3.touchSuppressed) return;
        hideInteractText();
        Scene3.setPointerDown(true);
        Scene3.setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    sceneThreeEl.addEventListener('touchmove', (e) => {
        if (Router.scene !== 3 || Scene3.touchSuppressed) return;
        Scene3.setPointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    sceneThreeEl.addEventListener('touchend', () => {
        if (Router.scene === 3 && !Scene3.touchSuppressed) Scene3.setPointerDown(false);
    }, { passive: true });

    /* ---- pointer (mouse / trackpad) ---- */
    function handlePointerDown(e) {
        if (Router.scene === 3) {
            if (Scene3.touchSuppressed) {
                if (Scene3.hitsSphere(e.clientX, e.clientY)) Pulse.notifyInputBlocked();
                return;
            }
            hideInteractText();
            Scene3.setPointerDown(true);
            Scene3.setPointer(e.clientX, e.clientY);
            return;
        }
        if (Router.scene === 2 && S2.activeCluster !== -1 && !V.compact) {
            carouselDragging = true;
            carouselPrevX = e.clientX;
            container.style.cursor = 'grabbing';
            return;
        }
        if (Router.scene !== 1 || isSystemLocked || transitionState !== 'IDLE') return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY; previousX = e.clientX;
        dragVelocity = 0;
        container.style.cursor = 'grabbing';
    }

    function handlePointerMove(e) {
        if (Router.scene === 3) {
            if (Scene3.touchSuppressed) return;
            Scene3.setPointer(e.clientX, e.clientY);
            return;
        }
        if (carouselDragging && Router.scene === 2 && S2.activeCluster !== -1) {
            S2.applyCarouselDelta(carouselPrevX - e.clientX);
            carouselPrevX = e.clientX;
            return;
        }
        if (Router.scene !== 1 || isSystemLocked || transitionState !== 'IDLE') return;

        if (isDragging) {
            dragVelocity = (e.clientX - previousX) * 0.004;
            targetRotation += dragVelocity;
            previousX = e.clientX;
            hasSwiped = true;
        }
        if (window.matchMedia('(hover: hover)').matches && e.pointerType === 'mouse' && !isDragging) {
            mouse.x = (e.clientX / V.width) * 2 - 1;
            mouse.y = -(e.clientY / V.height) * 2 + 1;
            raycaster.setFromCamera(mouse, carouselCam);
            const hits = raycaster.intersectObjects(hitBoxes);
            folders.forEach(f => f.userData.isHovered = false);
            container.style.cursor = 'grab';
            if (hits.length) {
                hits[0].object.userData.folder.userData.isHovered = true;
                container.style.cursor = 'pointer';
            }
        }
    }

    function handlePointerUp(e) {
        if (Router.scene === 3) {
            if (Scene3.touchSuppressed) return;
            Scene3.setPointerDown(false);
            return;
        }
        if (carouselDragging) {
            carouselDragging = false;
            container.style.cursor = 'grab';
            return;
        }
        if (Router.scene !== 1 || isSystemLocked || transitionState !== 'IDLE' || !isDragging) return;
        isDragging = false;
        container.style.cursor = 'grab';

        if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
            mouse.x = (e.clientX / V.width) * 2 - 1;
            mouse.y = -(e.clientY / V.height) * 2 + 1;
            raycaster.setFromCamera(mouse, carouselCam);
            const hits = raycaster.intersectObjects(hitBoxes);
            if (hits.length) {
                const folder = hits[0].object.userData.folder;
                const pIdx = PROJECT_INDEX[folderNames[folder.userData.index]];
                if (pIdx !== undefined) {
                    let diff = ((-folder.userData.index * angleStep) - targetRotation) % (Math.PI * 2);
                    if (diff > Math.PI) diff -= Math.PI * 2;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    targetRotation += diff;
                    pendingFolder = folder;
                    if (Math.abs(diff) > 0.01) transitionState = 'CENTERING_TO_OPEN';
                    else triggerFolderOpenSequence(folder, pIdx);
                }
                return;
            }
        }
        targetRotation += dragVelocity * 15;
        targetRotation = Math.round(targetRotation / angleStep) * angleStep;
    }

    function handlePointerLeave() {
        isDragging = false;
        if (carouselDragging) { carouselDragging = false; container.style.cursor = 'grab'; }
        if (Router.scene === 3) Scene3.clearPointer();
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerLeave);

    /* FIX 14 — `pointerout` on window fires every time the pointer crosses ANY
       element boundary, so simply moving the cursor from a folder label onto the
       canvas cancelled an in-progress drag and cleared the mind map's pointer.
       A null relatedTarget means the pointer genuinely left the window. */
    window.addEventListener('pointerout', (e) => {
        if (e.relatedTarget === null) handlePointerLeave();
    });

    /* ---- contact menu ----
       Same hover-to-expand interaction as the Profile page's Contact button
       (#hp-contact-btn) — mouseenter/mouseleave open/close it (click still
       works too, for touch/keyboard), for consistency between the Profile
       and Vault experiences. */
    const contactOpen = () => contactBtn.classList.add('is-open');
    const contactClose = () => contactBtn.classList.remove('is-open');

    /* Same fix, same reasoning as #hp-contact-btn above: hover only for a
       real mouse, so touch is left with just the click/keydown toggle below
       instead of that toggle fighting a synthesised mouseenter. */
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        contactBtn.addEventListener('mouseenter', contactOpen);
        contactBtn.addEventListener('mouseleave', contactClose);
    }
    contactBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        contactBtn.classList.toggle('is-open');
    });
    contactBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contactBtn.classList.toggle('is-open'); }
        if (e.key === 'Escape') contactClose();
    });
    document.addEventListener('click', contactClose);

    contactBtn.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = item.getAttribute('data-copy');
            const done = () => {
                item.classList.add('is-copied');
                setTimeout(() => item.classList.remove('is-copied'), 1500);
            };
            copyWithFeedback(text, done);
        });
    });

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                btn.style.setProperty('--x', `${e.clientX - rect.left}px`);
                btn.style.setProperty('--y', `${e.clientY - rect.top}px`);
            });
        });
    }

    /* ==========================================================================
       11. BOOT
       ========================================================================== */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    layoutScene1();
    V.onChange(() => {
        VirtualScroll.max = V.height * 1.5;
        layoutScene1();
    });

    renderer.compile(orbScene, orbCam);
    renderer.compile(carouselScene, carouselCam);
    Loop.start();

    /* Background asset prep starts immediately, invisibly, using homepage
       dwell time as free head start: 1.5s cover images, 3.0s mind-map warm
       + transcode, then image backfill (capped 5s so a slow connection
       can't starve it). */
    setTimeout(() => {
        Assets.warmCovers();
        setTimeout(() => {
            const mindMapNetwork = Scene3.prewarm();
            const cap = new Promise(res => setTimeout(res, 5000));
            Promise.race([mindMapNetwork, cap]).then(() => Assets.backfill());
        }, 1500);
    }, 1500);

    /* The Vault's arrival sequence. Runs on EVERY entry from the Profile page,
       not just the first — the token invalidates timers still pending from a
       previous run so two entrances can't interleave and double-fire the
       typewriter. Choreography and timings are unchanged. */
    let entranceToken = 0;
    function startVaultEntrance() {
        const tok = ++entranceToken;

        converge.active = true; converge.t = 0;
        clusterMaterial.uniforms.uConverge.value = 1;
        /* Restart the fade from nothing too, so the particles genuinely ARRIVE
           rather than cross-fading over an orb that's already sitting there. */
        bootFade.active = false;
        clusterMaterial.uniforms.uGlobalAlpha.value = 0;

        setTimeout(() => {
            if (tok !== entranceToken) return;
            bootFade.active = true; bootFade.t = 0;
        }, 100);

        setTimeout(() => {
            if (tok !== entranceToken) return;
            homeBtn.style.opacity = 1;
            homeBtn.style.pointerEvents = 'auto';
            contactBtn.style.opacity = 1;
            contactBtn.style.pointerEvents = 'auto';
            if (VirtualScroll.raw === 0) scrollText.style.opacity = 1;
            setTimeout(() => {
                if (tok !== entranceToken) return;
                if (VirtualScroll.raw === 0) {
                    welcomeTitle.style.opacity = 1;
                    startTypewriter();
                }
            }, 800);
        }, 560);
    }

    /* Hands the Vault's entrance off to the Homepage, which cannot call these
       functions directly (they live in this scope, gated behind the GSAP/
       THREE.js CDN awaits at the top of initDesktop). If "Enter The Vault"
       was already clicked while this was still loading, the queued click
       fires immediately. */
    VaultBridge.markReady(() => {
        resetVaultToOrb();
        startVaultEntrance();
    });

    /* ==========================================================================
       11c. HOMEPAGE (desktop) — standalone top-level initDesktopHomepage(),
       constructed before initDesktop() even runs, independent of the GSAP/
       THREE.js CDN awaits. See VaultBridge.markReady() for the hand-off.
       ========================================================================== */

    /* ==========================================================================
       12. PAGE LIFECYCLE — pagehide also fires entering the bfcache; the
       old unconditional dispose() tore down renderers a back-navigation's
       intact rAF loop then rendered into (black homepage), and left
       started/built=true so the mind map could never rebuild. Teardown now
       only runs when event.persisted === false; pageshow re-establishes
       anything a restore invalidated.
       ========================================================================== */
    let disposed = false;

    function hardDispose() {
        if (disposed) return;
        disposed = true;
        beginTransition();
        Assets.cancelPending();
        Pulse.dispose();
        S2.dispose();
        Scene3.dispose();
        folderPreviews.dispose();
        Loop.stop();
        Viewport.destroy();
        if (scene1Guard) scene1Guard.destroy();
        renderer.dispose();
        if (envRT) { envRT.dispose(); envRT = null; }
    }

    window.addEventListener('pagehide', (e) => {
        if (e.persisted) {
            /* Going into bfcache: keep everything, just stop speculative work. */
            Assets.cancelPending();
            Scene3.pausePreparation();
            Pulse.disableForNavigation();
            return;
        }
        hardDispose();
    });

    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        /* Restored from bfcache. Nothing was disposed, but the GPU may have
           dropped resources while frozen and the viewport may have changed. */
        V.refresh(true);
        if (Scene3.mounted) Scene3.prewarm({ force: true });
        if (!envRT) rebuildFolderEnvironment();
        layoutScene1();
    });

    /* Debug handle. Nothing in the app reads from window. */
    window.__portfolio = { Viewport: V, Router, S2, Scene3, Governor, Idle };

}


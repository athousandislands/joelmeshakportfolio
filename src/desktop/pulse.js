import { createPulseDiscovery } from './pulse-discovery.js';
import { createCameraSession, canAdvanceAlignment } from '../shared/camera-session.js';

export function createPulse({ Scene3, Router, clamp }) {
    const Pulse = (() => {
        /* Collapsed to one LEARN state (was a two-step LEARN_X/LEARN_Y handoff
           via an uncancelled setTimeout that could re-show a panel the state
           machine had already moved past — the actual cause of the stuck/
           unskippable tutorial). Removes the handoff, not just its timing bug. */
        const OFF = 'OFF', NOTICE = 'NOTICE', REQUESTING = 'REQUESTING', FRAME = 'FRAME', LEARN = 'LEARN', LIVE = 'LIVE';

        let state = OFF;
        let noticeSeen = false;
        let onboardingDone = false;

        const toggleEl = document.getElementById('pulse-toggle');
        const switchEl = toggleEl.querySelector('.pulse-switch');
        let discoveryStorage;
        try { discoveryStorage = window.localStorage; } catch {}
        const discovery = createPulseDiscovery({
            label: toggleEl.querySelector('.pulse-label'), storage: discoveryStorage,
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        toggleEl.addEventListener('pointerdown', discovery.stop, { passive: true });
        toggleEl.addEventListener('focusin', discovery.stop);
        const noticeEl = document.getElementById('pulse-notice');
        const beginBtn = noticeEl.querySelector('.pulse-begin');
        const onboardEl = document.getElementById('pulse-onboard');
        const camVideo = onboardEl.querySelector('video');
        const demoSlot = document.getElementById('pulse-demo-slot');
        const instructionEl = document.getElementById('pulse-instruction-text');
        const subtextEl = document.getElementById('pulse-subtext');
        const skipEl = document.getElementById('pulse-skip');
        const deniedEl = document.getElementById('pulse-denied');
        const inputBlockedEl = document.getElementById('pulse-input-blocked');

        const PALM_ICON = `<svg viewBox="0 0 24 30" fill="currentColor" aria-hidden="true">
            <path d="M15,27c-2.1,0-4-.8-5.5-2.3l-6.5-6.5c-.4-.4-.6-.8-.6-1.4,0-1.1.9-1.9,1.9-1.9s.9.1,1.3.3l2.7,1.4V7c0-1.1.9-2,2-2s.7,0,1,.3v-.3c0-1.1.9-2,2-2s2,.9,2,2v.3c.3-.2.6-.3,1-.3,1.1,0,2,.9,2,2v.3c.3-.2.6-.3,1-.3,1.1,0,2,.9,2,2v11.5c0,3.6-2.9,6.5-6.5,6.5ZM4.4,16c-.5,0-.9.4-.9.9s0,.5.3.6l6.5,6.5c1.3,1.3,3,2,4.8,2,3,0,5.5-2.5,5.5-5.5v-11.5c0-.6-.4-1-1-1s-1,.4-1,1v4.5c0,.3-.2.5-.5.5s-.5-.2-.5-.5v-6.5c0-.6-.4-1-1-1s-1,.4-1,1v6.5c0,.3-.2.5-.5.5s-.5-.2-.5-.5V5c0-.6-.4-1-1-1s-1,.4-1,1v8.5c0,.3-.2.5-.5.5s-.5-.2-.5-.5v-6.5c0-.6-.4-1-1-1s-1,.4-1,1v10.5c0,.2,0,.3-.2.4-.1,0-.3,0-.5,0l-3.5-1.7c-.3-.1-.6-.2-.9-.2Z"/>
        </svg>`;
        const PINCH_ICON = `<svg viewBox="0 0 71.96 85.59" fill="currentColor" aria-hidden="true">
            <path d="M64.3,29.52c-1.91,0-3.63.8-4.86,2.07-.52-3.22-3.31-5.68-6.67-5.68-2.01,0-3.81.88-5.05,2.27-.83-2.81-3.42-4.86-6.49-4.86-1.86,0-3.54.75-4.77,1.97V7.67c0-3.73-3.04-6.77-6.77-6.77s-6.77,3.04-6.77,6.77v41.06h0v.14c0,.65-.49.9-.65.96-.15.06-.68.23-1.14-.23l-7.06-7.06c-2.58-2.58-6.68-2.85-9.34-.62-1.48,1.24-2.34,2.98-2.42,4.9-.08,1.89.64,3.74,1.98,5.08l13.19,13.19c.9.9,1.66,1.9,2.24,2.96,8.95,16.36,21.07,16.55,26.89,16.64.12,0,.24,0,.36,0,6.2,0,12.1-2.45,16.64-6.92,4.73-4.66,7.45-11.11,7.45-17.69v-23.79c0-3.73-3.03-6.77-6.76-6.77ZM69.06,36.66v23.43c0,6.05-2.5,11.98-6.85,16.26-4.24,4.18-9.79,6.46-15.57,6.34-5.86-.09-16.78-.26-25.17-15.6-.67-1.23-1.54-2.38-2.58-3.42l-13.19-13.19c-.94-.94-1.45-2.25-1.39-3.58.06-1.35.67-2.58,1.71-3.45.84-.7,1.88-1.05,2.95-1.05,1.32,0,2.67.53,3.69,1.55l7.06,7.06c.89.89,2.16,1.14,3.32.66,1.16-.48,1.88-1.56,1.88-2.81v-.79s0,0,0,0V7.67c0-2.63,2.14-4.77,4.77-4.77s4.77,2.14,4.77,4.77v33.91c0,.1.03.18.05.27.12.42.49.73.95.73.55,0,1-.45,1-1v-11.48c0-2.63,2.14-4.77,4.77-4.77s4.77,2.14,4.77,4.77v11.48c0,.55.45,1,1,1s1-.45,1-1v-8.89c0-2.63,2.14-4.77,4.77-4.77s4.77,2.14,4.77,4.77v8.9c0,.55.45,1,1,1s1-.45,1-1v-5.29c0-.19.04-.38.06-.56.04-.35.11-.68.23-1,.65-1.86,2.4-3.21,4.48-3.21,2.2,0,4.04,1.5,4.58,3.53.11.4.18.81.18,1.24v.37h0Z"/>
            <path d="M6.14,32.3c.16.39.53.63.93.63.12,0,.25-.02.37-.07.51-.21.76-.79.56-1.3l-1.95-4.88-5.08,1.34c-.53.14-.85.69-.71,1.22s.69.85,1.22.71l2.08-.55L.11,36.26c-.25.49-.05,1.1.44,1.34.14.07.3.11.45.11.37,0,.72-.2.89-.55l3.45-6.86.8,1.99Z"/>
            <path d="M11.99,14.86l5.08-1.34c.53-.14.85-.69.71-1.22-.14-.53-.69-.85-1.22-.71l-2.08.55,3.48-6.93c.25-.49.05-1.09-.44-1.34-.49-.25-1.09-.05-1.34.44l-3.48,6.92-.8-1.99c-.2-.51-.79-.76-1.3-.56-.51.21-.76.79-.56,1.3l1.95,4.88Z"/>
        </svg>`;

        /* ---- MediaPipe (lazy) ---- */
        const MP_VERSION = '0.10.17';
        const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
        const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

        let handLandmarker = null;
        let modelLoading = null;
        let modelGeneration = 0;
        function ensureModel() {
            if (handLandmarker) return Promise.resolve(handLandmarker);
            if (modelLoading) return modelLoading;
            const generation = ++modelGeneration;
            modelLoading = (async () => {
                const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
                const vision = await FilesetResolver.forVisionTasks(WASM_URL);
                const model = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
                    runningMode: 'VIDEO',
                    numHands: 1
                });
                if (generation !== modelGeneration) {
                    model.close();
                    throw new Error('Tracking load superseded');
                }
                handLandmarker = model;
                return model;
            })().catch(error => { if (generation === modelGeneration) modelLoading = null; throw error; });
            return modelLoading;
        }

        let setupAttempt = 0;
        let frameShownAt = 0;
        const cameraSession = createCameraSession({
            getUserMedia: () => navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } },
                audio: false,
            }),
            attachVideo: value => { camVideo.srcObject = value; },
            playVideo: () => camVideo.play(),
            loadModel: ensureModel,
            onStage: label => { beginBtn.textContent = label + '\u2026'; },
        });

        async function requestCameraAndModel() {
            const attempt = ++setupAttempt;
            state = REQUESTING;
            beginBtn.disabled = true;
            noticeEl.classList.add('visible');
            try {
                await cameraSession.start();
                if (attempt !== setupAttempt) return null;
                if (Router.scene !== 3 || document.hidden) { releaseCamera(); return null; }
                return true;
            } catch (error) {
                if (attempt !== setupAttempt) return null;
                if (error.message.startsWith('Loading hand tracking')) {
                    modelGeneration++;
                    modelLoading = null;
                }
                deniedEl.textContent = error.name === 'NotAllowedError'
                    ? 'Camera access was declined. Allow it in your browser to use Pulse, then try again.'
                    : error.message === 'Setup cancelled' ? 'Pulse setup was cancelled.'
                    : 'Pulse could not start. Check your camera and connection, then try again.';
                return false;
            } finally {
                if (attempt === setupAttempt) {
                    beginBtn.disabled = false;
                    beginBtn.textContent = 'Begin';
                }
            }
        }

        function releaseCamera() {
            setupAttempt++;
            cameraSession.cancel();
        }

        /* ---- gesture detection ----
           Pinch's only job is engaging rotation. Normalised against the
           hand's own on-screen size so the threshold holds at any distance;
           hysteresis (lower enter- than exit-threshold) stops ~15Hz
           detection flickering at the boundary. */
        function pinchRatio(landmarks) {
            const thumbTip = landmarks[4], indexTip = landmarks[8];
            const wrist = landmarks[0], midMcp = landmarks[9];
            const gap = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
            const scale = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y) || 0.001;
            return gap / scale;
        }
        const PINCH_ENTER = 0.36;
        const PINCH_EXIT = 0.48;

        /* ---- rotation ----
           Pulse's only job is rotating the sphere; setPointer at screen
           centre means the existing raycast already focuses whatever tile
           faces the viewer, no new targeting needed. Rotation now injects
           from the RAW per-detection delta rather than the old SMOOTHED
           rawX/rawY (~300ms settle, a filter feeding a friction filter that
           permanently under-reported movement). Friction near-zero while
           pinching, decays after release for the glide. ROTATE_GAIN scaled
           up to match the ~15Hz raw signal's larger per-delta size. */
        const ROTATE_GAIN = 23.7;          // rad/s of velocity injected per unit RAW per-detection delta
        const ROTATE_FRICTION_DRIVE = 0.985;  // near-frictionless while pinching — the user is in control
        const ROTATE_FRICTION_GLIDE = 0.90;   // post-release decay — this is what makes the glide short and restrained
        const SMOOTH = 0.16;               // 60fps lerp, retained for visual smoothing only (not rotation)

        /* Push depth for whatever's centred: continuous while LIVE, on the same
           holdFactor smoothing as click-and-hold. Drifts 84-93% rather than a
           fixed/full 100% — Pulse controls rotation only, so a touch short of
           full projection reads as more measured while staying alive. */
        const FOCUS_BASE = 0.885;
        const FOCUS_DRIFT = 0.045;
        const FOCUS_DRIFT_HZ = 0.35;

        let rawX = 0.5, rawY = 0.5, rawTargetX = 0.5, rawTargetY = 0.5;
        /* Previous RAW detection sample — the basis for both rotation and
           tutorial progress. Distinct from the smoothed rawX/rawY. */
        let lastDetX = null, lastDetY = null;
        let rotVelX = 0, rotVelY = 0;
        let handVisible = false;
        let handLostAt = 0;
        let pinching = false;
        let presenceShown = false;   // step icon has swapped from palm -> pinch
        let pinchHoldStart = null;
        let lastDetectTime = 0;
        let rafId = 0;
        let simTime = 0;

        const PINCH_CONFIRM_MS = 250;      // brief debounce before FRAME confirms and advances

        /* TUTORIAL PROGRESSION — two paths, whichever lands first: (A)
           accumulated raw motion reaches MOTION_THRESH, or (B) a pinch held
           GRACE_MS with at least MOTION_FLOOR shown, confirming tracking
           works without demanding more travel than needed. Raw deltas, not
           the old smoothed signal, which under-reported real movement. */
        const MOTION_THRESH = 0.06;        // accumulated RAW motion (any direction) — small and forgiving
        const MOTION_FLOOR = 0.015;        // "they're clearly moving, not frozen"
        const GRACE_MS = 3000;             // pinch-held duration for the time-based path
        let stepMotionAccum = 0;
        let stepPinchStart = 0;

        function onHandFound() {
            handVisible = true;
            handLostAt = 0;
        }
        function onHandLost(now) {
            if (!handVisible) return;
            if (!handLostAt) handLostAt = now;
            if (now - handLostAt > 500) {
                handVisible = false;
                handLostAt = 0;
                pinching = false;
                lastDetX = lastDetY = null;
                rotVelX = 0; rotVelY = 0;
                if (state === FRAME) { presenceShown = false; demoSlot.innerHTML = `<div class="pulse-gesture-pulse">${PALM_ICON}</div>`; }
            }
        }

        /* Whatever's centred deepens toward the viewer continuously while
           Pulse is live — the illusion is that the user's movement is causing
           this, when the depth is really just a function of Pulse being on.
           Drifts within the 84-93% band (see FOCUS_BASE/FOCUS_DRIFT above)
           rather than sitting at one fixed depth. */
        function applyCenterFocus() {
            Scene3.setPointer(window.innerWidth / 2, window.innerHeight / 2);
            const drift = Math.sin(simTime * Math.PI * 2 * FOCUS_DRIFT_HZ) * FOCUS_DRIFT;
            Scene3.setPointerDown(clamp(FOCUS_BASE + drift, 0, 1));
        }

        /* Called once per DETECTION (not per frame) with the raw, unsmoothed
           hand position. This is where real movement enters the system. */
        function injectRotation(detX, detY) {
            if (lastDetX !== null && pinching) {
                rotVelX += (detX - lastDetX) * ROTATE_GAIN;
                rotVelY += (detY - lastDetY) * ROTATE_GAIN;
            }
            lastDetX = detX; lastDetY = detY;
        }

        /* Per-frame integration only — no injection here. Friction is
           near-zero while the user is actively pinching so nothing fights the
           input; the stronger decay only applies once they've let go, which
           is what makes the glide short rather than making the drag heavy. */
        function updateRotation(dt) {
            const friction = pinching ? ROTATE_FRICTION_DRIVE : ROTATE_FRICTION_GLIDE;
            const decay = Math.pow(friction, Math.max(dt * 60, 0.001));
            rotVelX *= decay; rotVelY *= decay;
            if (Math.abs(rotVelX) > 0.0001 || Math.abs(rotVelY) > 0.0001) {
                Scene3.nudgeRotation(rotVelX * dt, rotVelY * dt);
            }
        }

        function setProgressDot(progress) {
            const el = demoSlot.querySelector('.pulse-progress-dot');
            if (!el) return;
            const p = clamp(progress, 0, 1);
            const alpha = 0.28 + p * 0.72;
            const GREEN = [67, 183, 93];
            const r = Math.round(255 + (GREEN[0] - 255) * p);
            const g = Math.round(255 + (GREEN[1] - 255) * p);
            const b = Math.round(255 + (GREEN[2] - 255) * p);
            el.style.background = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
            el.classList.toggle('done', p >= 1);
        }

        function frameLoop() {
            if (state === OFF) { rafId = 0; return; }
            rafId = requestAnimationFrame(frameLoop);

            const now = performance.now();
            const dt = Math.min(lastFrameTime ? (now - lastFrameTime) / 1000 : 1 / 60, 0.05);
            lastFrameTime = now;
            simTime += dt;

            if (handLandmarker && camVideo.readyState >= 2 && now - lastDetectTime >= 66) {
                lastDetectTime = now;
                let result = null;
                try { result = handLandmarker.detectForVideo(camVideo, now); } catch (e) { result = null; }
                const lm = result && result.landmarks && result.landmarks[0];
                if (lm) {
                    const wrist = lm[0], midMcp = lm[9];
                    const c = { x: (wrist.x + midMcp.x) / 2, y: (wrist.y + midMcp.y) / 2 };
                    const detX = clamp(1 - c.x, 0, 1);  // mirrored, selfie-style
                    const detY = clamp(c.y, 0, 1);
                    rawTargetX = detX;
                    rawTargetY = detY;

                    const ratio = pinchRatio(lm);
                    if (!pinching && ratio < PINCH_ENTER) pinching = true;
                    else if (pinching && ratio > PINCH_EXIT) pinching = false;

                    /* Tutorial progress measured off the RAW delta, same as
                       rotation — the smoothed signal under-reports real
                       movement, which is what made the old threshold feel
                       impossible to reach. */
                    if (state === LEARN && pinching && lastDetX !== null) {
                        stepMotionAccum += Math.hypot(detX - lastDetX, detY - lastDetY);
                    }

                    injectRotation(detX, detY);

                    if (!handVisible && state === FRAME && !presenceShown) {
                        presenceShown = true;
                        demoSlot.innerHTML = `<div class="pulse-gesture-pulse">${PINCH_ICON}</div>`;
                    }
                    onHandFound();
                } else {
                    pinching = false;
                    lastDetX = lastDetY = null;
                    onHandLost(now);
                }
            }

            rawX += (rawTargetX - rawX) * SMOOTH;
            rawY += (rawTargetY - rawY) * SMOOTH;

            if (state === LEARN || state === LIVE) {
                updateRotation(dt);
            }
            if (state === LIVE) {
                applyCenterFocus();
            }

            if (state === FRAME) {
                if (pinching) {
                    if (pinchHoldStart === null) pinchHoldStart = now;
                    if (canAdvanceAlignment({ now, shownAt: frameShownAt, pinchSince: pinchHoldStart, pinching })) advanceFromFrame();
                } else {
                    pinchHoldStart = null;
                }
            } else if (state === LEARN) {
                /* Two independent completion paths, whichever lands first. */
                if (pinching) {
                    if (!stepPinchStart) stepPinchStart = now;
                } else {
                    stepPinchStart = 0;
                }

                const motionProgress = stepMotionAccum / MOTION_THRESH;
                const graceProgress = (stepPinchStart && stepMotionAccum >= MOTION_FLOOR)
                    ? (now - stepPinchStart) / GRACE_MS
                    : 0;
                setProgressDot(Math.max(motionProgress, graceProgress));

                const byMotion = stepMotionAccum >= MOTION_THRESH;
                const byGrace = stepPinchStart
                    && stepMotionAccum >= MOTION_FLOOR
                    && (now - stepPinchStart) >= GRACE_MS;
                if (byMotion || byGrace) finishOnboarding();
            }
        }
        let lastFrameTime = 0;
        function startLoop() { if (!rafId) { lastDetectTime = 0; lastFrameTime = 0; rafId = requestAnimationFrame(frameLoop); } }
        function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

        /* ---- toggle reveal ----
           Reveals once automatically when the scene settles (see
           revealToggleOnce, called from routing once the Mind Map transition
           finishes), plus stays available on interaction as a fallback for
           whenever it's since faded. */
        let toggleHideTimer = null;
        function stickyVisible() {
            return state !== OFF || noticeEl.classList.contains('visible') || onboardEl.classList.contains('visible');
        }
        function revealToggle() {
            toggleEl.classList.add('visible');
            clearTimeout(toggleHideTimer);
            if (!stickyVisible()) toggleHideTimer = setTimeout(() => toggleEl.classList.remove('visible'), discovery.active() ? 12500 : 6000);
        }
        ['mousemove', 'wheel', 'pointerdown', 'keydown'].forEach(evt => {
            window.addEventListener(evt, () => { if (Router.scene === 3) revealToggle(); }, { passive: true });
        });

        function setToggleOn(v) {
            toggleEl.classList.toggle('on', v);
            switchEl.setAttribute('aria-checked', String(v));
        }

        /* ---- denied ---- */
        let deniedTimer = null;
        function showDenied() {
            deniedEl.textContent = "Camera access is off, so Pulse can\u2019t see your movement. You can enable it in your browser settings and try again.";
            deniedEl.classList.add('visible');
            clearTimeout(deniedTimer);
            deniedTimer = setTimeout(() => deniedEl.classList.remove('visible'), 5000);
        }

        /* ---- blocked-input notice ----
           Only from a deliberate click/hold on the sphere while Pulse is
           fully live — never onboarding/hover/touch. Auto-dismisses; a
           second trigger while showing dismisses rather than re-shows. */
        let blockedVisible = false;
        let blockedAutoTimer = null;
        function notifyInputBlocked() {
            if (state !== LIVE) return;   // never during onboarding
            if (blockedVisible) { dismissInputBlocked(); return; }
            blockedVisible = true;
            inputBlockedEl.classList.add('visible');
            clearTimeout(blockedAutoTimer);
            blockedAutoTimer = setTimeout(dismissInputBlocked, 2600);
        }
        function dismissInputBlocked() {
            if (!blockedVisible) return;
            blockedVisible = false;
            inputBlockedEl.classList.remove('visible');
            clearTimeout(blockedAutoTimer);
        }

        /* dockTimer fixes stuck-tutorial: an uncancelled setTimeout could let a
           stale callback re-show a panel after a fast step completion had
           already moved state past it, making Skip a silent no-op. Every
           transition now clears any pending dock timer first. */
        let dockTimer = null;

        function showNoticeState() {
            clearTimeout(dockTimer);
            state = NOTICE;
            beginBtn.disabled = false;
            beginBtn.textContent = 'Begin';
            noticeEl.classList.add('visible');
            revealToggle();
        }

        async function onBegin() {
            noticeSeen = true;   // seen the notice, regardless of what permission decides
            beginBtn.disabled = true;
            beginBtn.textContent = 'Requesting camera\u2026';
            const ok = await requestCameraAndModel();
            if (ok === null) return;
            noticeEl.classList.remove('visible');
            if (!ok) {
                showDenied();
                setToggleOn(false);
                state = OFF;
                Scene3.setTouchSuppressed(false);
                revealToggle();
                return;
            }
            enterFrame(true);
        }

        function enterFrame(full) {
            clearTimeout(dockTimer);
            state = FRAME;
            frameShownAt = performance.now();
            handVisible = false; handLostAt = 0; pinching = false; pinchHoldStart = null;
            presenceShown = false;
            lastDetX = lastDetY = null;
            rotVelX = 0; rotVelY = 0;
            rawX = rawTargetX = 0.5; rawY = rawTargetY = 0.5;
            onboardEl.dataset.size = 'large';
            demoSlot.innerHTML = full ? `<div class="pulse-gesture-pulse">${PALM_ICON}</div>` : '';
            instructionEl.textContent = 'Get your hand in frame. When you\u2019re ready, do a pinch gesture to begin.';
            subtextEl.textContent = full ? '' :
                'Your camera is only used to detect your movement. Nothing is recorded or saved.';
            skipEl.style.display = full ? '' : 'none';
            onboardEl.classList.add('visible');
            startLoop();
            revealToggle();
        }

        function advanceFromFrame() {
            if (onboardingDone) { finishOnboarding(); return; }
            enterLearn();
        }

        function enterLearn() {
            clearTimeout(dockTimer);
            state = LEARN;
            stepMotionAccum = 0;
            stepPinchStart = 0;
            lastDetX = lastDetY = null;   // fresh baseline — measure new movement only
            onboardEl.classList.remove('visible');
            dockTimer = setTimeout(() => {
                dockTimer = null;
                onboardEl.dataset.size = 'small';
                demoSlot.innerHTML = `<div class="pulse-gesture-reminder">${PINCH_ICON}</div>` +
                    '<div class="pulse-orbit">' +
                    '<div class="pulse-orbit-ring"></div>' +
                    '<div class="pulse-orbit-spin"><span class="pulse-orbit-dot"></span></div>' +
                    '</div><span class="pulse-progress-dot"></span>';
                instructionEl.textContent = 'Pinch and move to rotate \u2014 try it now.';
                subtextEl.textContent = '';
                onboardEl.classList.add('visible');
            }, 260);
        }

        function finishOnboarding() {
            clearTimeout(dockTimer);
            dockTimer = null;
            onboardingDone = true;
            onboardEl.classList.remove('visible');
            state = LIVE;
            setToggleOn(true);
            revealToggle();
        }

        function skipTutorial() {
            if (state !== FRAME && state !== LEARN) return;
            finishOnboarding();
        }

        function enable() {
            if (state !== OFF || Router.scene !== 3) return;
            setToggleOn(true);
            /* Touch steps aside for the whole Pulse session — including the
               onboarding panels, since the globe is already live behind them.
               Mouse/trackpad is deliberately unaffected. */
            Scene3.setTouchSuppressed(true);
            if (!noticeSeen) {
                showNoticeState();
                return;
            }
            (async () => {
                const ok = await requestCameraAndModel();
                if (ok === null) return;
                noticeEl.classList.remove('visible');
                if (!ok) {
                    showDenied();
                    setToggleOn(false);
                    state = OFF;
                    Scene3.setTouchSuppressed(false);
                    revealToggle();
                    return;
                }
                enterFrame(!onboardingDone);
            })();
        }

        function disable() {
            clearTimeout(dockTimer);
            dockTimer = null;
            stopLoop();
            releaseCamera();
            noticeEl.classList.remove('visible');
            onboardEl.classList.remove('visible');
            deniedEl.classList.remove('visible');
            inputBlockedEl.classList.remove('visible');
            blockedVisible = false;
            clearTimeout(blockedAutoTimer);
            Scene3.setPointerDown(false);
            Scene3.clearPointer();
            Scene3.setTouchSuppressed(false);   // touch and mouse both behave exactly as before again
            setToggleOn(false);
            state = OFF;
            handVisible = false; handLostAt = 0; pinching = false;
            lastDetX = lastDetY = null;
            rotVelX = 0; rotVelY = 0;
            stepMotionAccum = 0; stepPinchStart = 0;
        }

        switchEl.addEventListener('click', () => { if (state === OFF) enable(); else disable(); });
        switchEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchEl.click(); }
        });
        beginBtn.addEventListener('click', onBegin);
        document.addEventListener('visibilitychange', () => { if (document.hidden) disable(); });
        window.addEventListener('pagehide', disable);
        skipEl.addEventListener('click', skipTutorial);

        return {
            /* Leaving the Mind Map always turns Pulse off — the model stays
               resident in memory (see ensureModel's cache) so a later
               re-entry and re-activation is instant; only the camera stream
               and the per-frame loop actually stop. */
            dispose() { discovery.dispose(); toggleEl.removeEventListener('pointerdown', discovery.stop); toggleEl.removeEventListener('focusin', discovery.stop); disable(); modelGeneration++; modelLoading = null; handLandmarker?.close(); handLandmarker = null; },
            disableForNavigation() { discovery.stop(); if (state !== OFF) disable(); },
            /* Called once by the routing section when the scene-3 entrance
               transition finishes, so the toggle becomes discoverable as soon
               as the page has settled. */
            revealToggleOnce() { discovery.enter(); revealToggle(); },
            /* Called by the mouse/touch handlers when an interaction attempt
               is blocked because Pulse currently has input suppressed. */
            notifyInputBlocked() { notifyInputBlocked(); }
        };
    })();
    return Pulse;
}

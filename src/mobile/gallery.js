import { mobileVideo, videoPoster } from '../shared/media.js';
import { createGalleryHint } from './gallery-hint.js';
export function createGallery({ root, REDUCED, clamp }) {
    const Gallery = (() => {
        const page = document.getElementById('gallery');
        const scrollEl = document.getElementById('gallery-scroll');
        const spacerEl = document.getElementById('gallery-scroll-spacer');
        const viewportEl = document.getElementById('gallery-viewport');
        const welcomeEl = document.getElementById('gallery-welcome');
        let hintStorage;
        try { hintStorage = window.localStorage; } catch {}
        const swipeHint = createGalleryHint({ element: document.getElementById('gallery-swipe-hint'), storage: hintStorage, reduced: REDUCED });
        scrollEl.addEventListener('pointermove', event => { if (event.buttons || event.pointerType === 'touch') swipeHint.dismiss(); }, {passive:true});
        scrollEl.addEventListener('keydown', swipeHint.dismiss);

        /* Every entry points at its real source file directly — see the
           video.src assignment below for why. */
        const GALLERY_VIDEOS = [
            { src: 'assets/projects/a-thousand-islands/videos/adaptive-motion.mp4', title: 'Adaptive Motion' },
            { src: 'assets/projects/a-thousand-islands/videos/particle-engine.mp4', title: 'Particle Engine' },
            { src: 'assets/projects/naivaa/videos/green-bag.mp4', title: 'Nairobi Bags' },
            { src: 'assets/projects/a-thousand-islands/videos/voice-control.mp4', title: 'Voice Control' },
            { src: 'assets/projects/a-thousand-islands/videos/visual-identity.mp4', title: 'Visual Identity' },
            { src: 'assets/projects/graphic-design/videos/alexandra-gathukia.mp4', title: 'Logo Reveal' },
            { src: 'assets/projects/a-thousand-islands/videos/spatial-experience.mp4', title: 'Spatial Experience' },
            { src: 'assets/projects/a-thousand-islands/videos/dynamic-forms.mp4', title: 'Dynamic Forms' }
        ];

        /* ---- motion engine constants — Echo reference, with depth reworked
           to never rely on opacity (see positionCards) ---- */
        const STEP = 0.9;              // scroll-progress spacing between cards
        const ARC_ANGLE = Math.PI * 0.777;
        const SETTLE_POWER = 2.0;
        const SETTLE_STRENGTH = 0.85;
        const SETTLE_WINDOW = 2.5;
        const Z_DEPTH = 620;            // widened from Echo's 550 — takes over some of
                                        // the depth cue opacity used to carry
        const SCALE_FALLOFF = 0.24;     // receding cards shrink rather than fade
        const CULL_RANGE = 2.0;
        /* ---- settle isolation ----
           The resting neighbour's Z-pushed offset still gets pulled back
           toward screen centre by perspective enough to visibly peek above
           the settled tile. These thresholds fade it out over the last
           stretch of its travel into a settled slot, so only one card shows
           at rest; mid-swipe both stay fully opaque — only the resting
           frame changes. */
        const ISOLATE_FADE_IN = 0.58;    // fully opaque at or below this |localP|
        const ISOLATE_FADE_OUT = 0.80;   // fully transparent at or above it
        const POSTER_SEEK = 0.6;        // seconds — later than Echo's 0.01 to dodge blank first frames
        /* 2, was 3 — Android hardware video decoders are a small shared pool,
           and several simultaneous decode+playback requests can exceed it
           (losing elements render black with no error). Also matches the
           desktop Vault's own cap on stronger hardware, which was backwards
           at 3. */
        const MAX_CONCURRENT = 2;

        function approach(current, target, ratePerSixtyHz, dt) {
            const f = 1 - Math.pow(1 - ratePerSixtyHz, dt * 60);
            return current + (target - current) * f;
        }

        /* ---- card construction ---- */
        const cards = [];
        const playingSet = new Set();

        function pauseCard(rec) {
            rec.video.pause();
            playingSet.delete(rec);
            rec.cover.style.opacity = '1';
            rec.playBtn.classList.remove('is-pause');
            rec.playBtn.classList.add('is-play');
            rec.playBtn.setAttribute('aria-label', 'Play video');
        }

        /* Videos keep decoding when the tab is backgrounded — there's no
           reason to spend battery/CPU on frames nobody can see. Pausing on
           hide rather than tearing anything down means `document.hidden`
           flipping back simply leaves the cards exactly as the person left
           them, paused with their last frame as the poster. */
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                Array.from(playingSet).forEach(pauseCard);
            }
        });

        function enforceConcurrencyCap(justAdded) {
            if (playingSet.size <= MAX_CONCURRENT) return;
            for (const rec of playingSet) {
                if (rec !== justAdded) { pauseCard(rec); break; }
            }
        }

        function buildCard(v, i) {
            const wrapper = document.createElement('div');
            wrapper.className = 'gallery-card';

            const inner = document.createElement('div');
            inner.className = 'gallery-card-inner';

            const casing = document.createElement('div');
            casing.className = 'gallery-casing';

            const video = document.createElement('video');
            video.muted = true; video.loop = true; video.playsInline = true;
            video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
            video.poster = videoPoster(v.src);
            video.preload = video.poster ? 'none' : 'metadata';
            /* <source> list, not a bare video.src, so the browser negotiates codecs
               itself — adding VP9/WebM later is a one-line data change
               (v.srcWebm). WebM first (bonus when present), H.264 last as
               the universal floor every device can decode. */
            if (v.srcWebm) {
                const s = document.createElement('source');
                s.src = v.srcWebm; s.type = 'video/webm';
                video.appendChild(s);
            }
            const mp4 = document.createElement('source');
            mp4.src = mobileVideo(v.src); mp4.type = 'video/mp4';
            video.appendChild(mp4);

            /* Fires on code 4 (no source decodable) or code 2 (network failure).
               Previously never listened for at all — play() fired and the
               cover hid unconditionally regardless of whether playback
               actually started, so a failure looked like nothing happening. */
            video.addEventListener('error', () => {
                /* `error` alone isn't proof of failure — it also fires mid <source>-list
                   negotiation, with video.error possibly null or
                   MEDIA_ERR_ABORTED (from this code's own pause()/load()
                   calls via the concurrency cap and retry). Only a populated,
                   non-abort MediaError is a real failure. */
                const err = video.error;
                if (!err) return;
                if (err.code === 1 /* MEDIA_ERR_ABORTED */) return;
                markFailed(rec, err.code === 4 ? 'unsupported' : 'network');
            });

            /* First-frame poster trick: with preload="metadata" the browser
               only fetches headers, not the full stream. Nudging currentTime
               once metadata is known forces it to decode and paint that one
               frame as the visible poster — no separate capture element. */
            video.addEventListener('loadedmetadata', function onMeta() {
                if (this.currentTime === 0) {
                    try { this.currentTime = POSTER_SEEK; } catch (e) {}
                }
            }, { once: true });

            const cover = document.createElement('div');
            cover.className = 'gallery-cover';
            const title = document.createElement('h3');
            title.className = 'gallery-card-title';
            title.textContent = v.title;
            const message = document.createElement('p');
            message.className = 'gallery-video-message';
            message.hidden = true;
            cover.append(title, message);

            casing.append(video, cover);

            /* Control cluster: video tile, then scrubber, then the play
               button — in that order, centred, reading as one system. */
            const controls = document.createElement('div');
            controls.className = 'gallery-controls';

            const scrub = document.createElement('input');
            scrub.type = 'range';
            scrub.className = 'gallery-scrub';
            scrub.min = '0'; scrub.max = '100'; scrub.step = '0.1'; scrub.value = '0';
            scrub.setAttribute('aria-label', 'Video progress');
            let isScrubbing = false;

            video.addEventListener('timeupdate', () => {
                if (isScrubbing || !video.duration) return;
                const pct = (video.currentTime / video.duration) * 100;
                scrub.value = String(pct);
                scrub.style.setProperty('--p', pct + '%');
            });
            scrub.addEventListener('input', () => {
                isScrubbing = true;
                scrub.style.setProperty('--p', scrub.value + '%');
                if (video.duration) video.currentTime = (Number(scrub.value) / 100) * video.duration;
            });
            scrub.addEventListener('change', () => { isScrubbing = false; });
            /* Dragging or tapping the track must never also toggle play via
               the card's own click handler below. */
            ['click', 'pointerdown'].forEach(evt => scrub.addEventListener(evt, (e) => e.stopPropagation()));

            const playWrap = document.createElement('div');
            playWrap.className = 'gallery-play-wrap';
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.setAttribute('aria-label', 'Play or pause ' + v.title);
            playBtn.className = 'gallery-play-btn is-play';
            playBtn.innerHTML =
                '<span class="gallery-icon-play"><svg viewBox="0 0 110 135" aria-hidden="true">' +
                '<path d="M30.2,19.3l63.2,36.5c9,5.2,9,18.2,0,23.4l-63.2,36.5c-9,5.2-20.3-1.3-20.3-11.7V31c0-10.4,11.2-16.9,20.3-11.7h0Z"/>' +
                '</svg></span>' +
                '<span class="gallery-icon-pause"><svg viewBox="0 0 30 40" aria-hidden="true">' +
                '<path d="M0,34.99c0,2.77,2.24,5.01,5,5.01s5-2.24,5-5.01V5.01C10,2.24,7.76,0,5,0S0,2.24,0,5.01v29.99Z"/>' +
                '<path d="M20,34.99c0,2.77,2.24,5.01,5,5.01s5-2.24,5-5.01V5.01c0-2.77-2.24-5.01-5-5.01s-5,2.24-5,5.01v29.99Z"/>' +
                '</svg></span>';
            playWrap.appendChild(playBtn);

            controls.append(scrub, playWrap);
            inner.append(casing, controls);
            wrapper.appendChild(inner);
            viewportEl.appendChild(wrapper);

            const rec = { i, wrapper, inner, casing, video, cover, message, playBtn, display: null, transform: null, alpha: null, failed: false };

            wrapper.addEventListener('click', () => {
                if (rec.failed) { retryCard(rec); return; }
                /* No drag-vs-tap disambiguation needed here — this is a plain
                   native scroll container, and browsers already suppress the
                   synthetic click that would otherwise follow a scroll drag. */
                if (video.preload !== 'auto') video.preload = 'auto';
                if (video.paused) {
                    playingSet.add(rec);
                    enforceConcurrencyCap(rec);
                    startPlayback(rec);
                } else {
                    pauseCard(rec);
                }
            });

            return rec;
        }

        /* ---- video failure handling ----
           One detector: the `error` event in buildCard() (a real MediaError)
           plus the NotSupportedError branch of play() rejection below. The
           1800ms elapsed-time watchdog that used to live here is REMOVED,
           not lengthened — it read normal buffering (and any card the
           concurrency cap had legitimately paused) as failure, since elapsed
           time can't distinguish "waiting" from "failed" at any threshold.
           A slow video now just shows its poster; silence is the loading state. */
        function startPlayback(rec) {
            const p = rec.video.play();
            if (p && p.catch) {
                p.catch((e) => {
                    const name = e && e.name;
                    /* Only NotSupportedError means the video will never play. AbortError
                       comes from this code's own pause()/load() calls
                       (concurrency cap, retry, cull); NotAllowedError is an
                       autoplay block. Neither is broken — both just return to
                       resting paused. Previously every rejection was marked
                       'unsupported', flagging a good file on a second tap. */
                    if (name === 'NotSupportedError') { markFailed(rec, 'unsupported'); return; }
                    if (!rec.failed) pauseCard(rec);
                });
            }
            rec.cover.style.opacity = '0';
            rec.playBtn.classList.remove('is-play'); rec.playBtn.classList.add('is-pause');
            rec.playBtn.setAttribute('aria-label', 'Pause video');
        }

        function markFailed(rec, reason) {
            if (rec.failed) return;
            rec.failed = true;
            playingSet.delete(rec);
            rec.video.pause();
            rec.wrapper.classList.add('gallery-video-failed');
            rec.cover.style.opacity = '1';
            rec.playBtn.classList.remove('is-pause'); rec.playBtn.classList.add('is-play');
            rec.playBtn.setAttribute('aria-label', 'Play video');
            /* Wording matched to what actually happened, not a single generic
               line — a codec problem and a dropped network request are
               different failures and read differently to someone who isn't
               going to see a status code. Neither mentions the mechanism. */
            rec.message.textContent = reason === 'unsupported'
                ? "Video can't play in this browser. Showing a preview instead."
                : "Couldn't load this video. Tap to retry.";
            rec.message.hidden = false;
        }

        function retryCard(rec) {
            rec.failed = false;
            rec.wrapper.classList.remove('gallery-video-failed');
            rec.message.hidden = true;
            /* .load() resets the element and re-runs source selection from
               the top of the <source> list — a genuine retry, not just
               calling play() again on an element already in an error state. */
            rec.video.load();
            playingSet.add(rec);
            enforceConcurrencyCap(rec);
            startPlayback(rec);
        }

        GALLERY_VIDEOS.forEach((v, i) => cards.push(buildCard(v, i)));

        /* ---- entrance ---- */
        function playEntrance() {
            const inner = cards[0].inner;
            inner.classList.add('gallery-entrance-start');
            void inner.offsetWidth; // force reflow so the start state actually paints
            inner.classList.remove('gallery-entrance-start');
            inner.classList.add('gallery-entrance-go');
            setTimeout(() => inner.classList.remove('gallery-entrance-go'), 840);
        }

        /* How long the first tile takes to arrive and settle. The welcome
           typewriter starts after this, not alongside it. */
        const GALLERY_SETTLE_MS = 720;
        let welcomeStartTimer = null;

        const WELCOME_TEXT = 'Welcome to my Vault';
        let welcomeTimeout;
        function startWelcomeTypewriter() {
            clearTimeout(welcomeTimeout);
            /* Hidden entirely in landscape (see the LANDSCAPE CSS) — skip the
               work rather than typing into an invisible element on a timer. */
            if (root.dataset.orient === 'landscape') {
                welcomeEl.textContent = '';
                return;
            }
            welcomeEl.textContent = '';
            welcomeEl.classList.remove('done');
            welcomeEl.style.opacity = '1';
            if (REDUCED) { welcomeEl.textContent = WELCOME_TEXT; welcomeEl.classList.add('done'); return; }
            let i = 0;
            (function typeChar() {
                if (i < WELCOME_TEXT.length) {
                    welcomeEl.textContent += WELCOME_TEXT.charAt(i++);
                    welcomeTimeout = setTimeout(typeChar, 65);
                } else {
                    welcomeEl.classList.add('done');
                }
            })();
        }

        let hasSwiped = false;
        function dismissWelcome() {
            if (hasSwiped) return;
            hasSwiped = true;
            welcomeEl.style.opacity = '0';
        }

        /* ---- per-frame motion — the Echo math, ported and adapted ---- */
        function positionCards() {
            const vw = window.innerWidth, vh = window.innerHeight;
            const scrollP = currentScroll / vh;

            cards.forEach((rec) => {
                const localP = scrollP - (rec.i * STEP);
                if (localP > -CULL_RANGE && localP < CULL_RANGE) {
                    if (rec.display !== 'block') {
                        rec.wrapper.style.display = 'block';
                        rec.display = 'block';
                    }

                    /* "Magnetic settling": slows a card as it nears the centre
                       focus point rather than moving through it linearly. */
                    const settledP = localP * (1.0 - (Math.pow(Math.max(0, 1.0 - Math.abs(localP) * SETTLE_WINDOW), SETTLE_POWER) * SETTLE_STRENGTH));

                    const posX = (-Math.sin(settledP * ARC_ANGLE) * vw * 0.65).toFixed(1);
                    const posY = (settledP * -vh * 0.9).toFixed(1);
                    const posZ = ((Math.cos(settledP * ARC_ANGLE) - 1.0) * Z_DEPTH).toFixed(1);
                    const rotY = (settledP * 40.5).toFixed(2);
                    const rotZ = (settledP * -4.5).toFixed(2);
                    /* Depth is carried by position, rotation and scale only —
                       cards never fade. Scale falloff compensates for opacity
                       no longer doing part of that job. */
                    const scale = (1 - Math.min(Math.abs(settledP), 1.4) * SCALE_FALLOFF).toFixed(3);
                    const transform = `translate(-50%, -50%) translate3d(${posX}px, ${posY}px, ${posZ}px) rotateY(${rotY}deg) rotateZ(${rotZ}deg) scale(${scale})`;
                    if (transform !== rec.transform) { rec.wrapper.style.transform = transform; rec.transform = transform; }

                    /* The only use of opacity on a card — not the depth cue the design
                       rules out (depth stays position/rotation/scale). Only
                       suppresses a neighbour that's finished travelling;
                       a transparent card stays display:block with playback
                       untouched. */
                    const alpha = clamp((ISOLATE_FADE_OUT - Math.abs(localP)) /
                                        (ISOLATE_FADE_OUT - ISOLATE_FADE_IN), 0, 1).toFixed(3);
                    if (alpha !== rec.alpha) { rec.wrapper.style.opacity = alpha; rec.alpha = alpha; }
                } else if (rec.display !== 'none') {
                    /* Culled off-screen. Echo's own reference only hides these
                       (display:none) without pausing — added an explicit
                       pause+reset here since a hidden card serves no purpose
                       still decoding in the background; costs nothing visible
                       since it's already invisible either way. */
                    rec.wrapper.style.display = 'none';
                    rec.display = 'none';
                    if (!rec.video.paused) pauseCard(rec);
                    try { rec.video.currentTime = POSTER_SEEK; } catch (e) {}
                }
            });
        }

        let currentScroll = 0, targetScroll = 0;
        let lastFrameTime = 0;
        let running = false;

        function frame(now) {
            if (!running) return;
            requestAnimationFrame(frame);
            const dt = Math.min((now - (lastFrameTime || now)) / 1000, 1 / 30);
            lastFrameTime = now;
            currentScroll = approach(currentScroll, targetScroll, targetScroll < currentScroll ? 0.065 : 0.05, dt);
            positionCards();
        }

        scrollEl.addEventListener('scroll', () => {
            targetScroll = scrollEl.scrollTop;
            if (targetScroll > 8) swipeHint.dismiss();
            if (!hasSwiped && targetScroll > 8) dismissWelcome();
            if (scrollEl.scrollTop === 0) {
                cards.forEach(rec => { if (!rec.video.paused) pauseCard(rec); });
            }
        }, { passive: true });

        function resizeSpacer() {
            const vh = window.innerHeight;
            /* Scroll range stops exactly where the last card centres —
               previously this added CULL_RANGE + 0.5 extra units past that
               point, which is why scrolling continued into empty space after
               the final video. The last video centering IS the end now. */
            const totalP = (cards.length - 1) * STEP;
            spacerEl.style.height = Math.round(vh * totalP) + 'px';
        }

        /* The welcome heading is hidden outright in landscape now (see the
           LANDSCAPE CSS), so there is no position to compute there. This just
           clears any inline top left over from a previous orientation so the
           portrait CSS rule takes back control cleanly on rotation. */
        function positionWelcomeForOrientation() {
            welcomeEl.style.top = '';
        }

        /* ---- public API ---- */
        function enter() {
            swipeHint.enter();
            running = true;
            lastFrameTime = 0;
            currentScroll = 0; targetScroll = 0;
            scrollEl.scrollTop = 0;
            hasSwiped = false;

            resizeSpacer();
            positionCards();   // synchronous first pass so card 0 is correctly
                                // placed before anything paints
            positionWelcomeForOrientation();
            requestAnimationFrame(frame);

            /* First video fades in with a slight scale-up at the same moment
               the typewriter starts — both are the immediate "you've arrived"
               beat. */
            playEntrance();
            /* Waits for the tile to settle. Re-checks hasSwiped because the
               user can swipe during the arrival, and dismissWelcome() having
               already run must not be undone by a late start. */
            clearTimeout(welcomeStartTimer);
            welcomeStartTimer = setTimeout(() => {
                if (!hasSwiped) startWelcomeTypewriter();
            }, REDUCED ? 0 : GALLERY_SETTLE_MS);
        }

        function leave() {
            swipeHint.dismiss();
            running = false;
            clearTimeout(welcomeStartTimer);
            clearTimeout(welcomeTimeout);
            welcomeEl.style.opacity = '0';
            cards.forEach(rec => {
                if (!rec.video.paused) pauseCard(rec);
                /* #gallery never leaves display:block as a section (only fades via
                   page-level opacity), so without this, any scrolled-into-view
                   card stayed promoted to its own GPU layer for the rest of
                   the session — invisibly costing compositor bandwidth under
                   Home on every scroll/touch. enter() rebuilds visible cards
                   from scratch anyway, so resetting here is safe. */
                rec.wrapper.style.display = 'none';
                rec.display = 'none';
                rec.transform = null;
                rec.alpha = null;
                /* A played video was upgraded to preload:'auto' for instant
                   resume within the session — release that buffered data once
                   the session (this Gallery visit) is over. */
                if (rec.video.preload === 'auto') rec.video.preload = 'metadata';
            });
        }

        function layout() {
            resizeSpacer();
            positionCards();
            positionWelcomeForOrientation();
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) cards.forEach(rec => { if (!rec.video.paused) rec.video.pause(); });
        });

        return { enter, leave, layout };
    })();
    return Gallery;
}

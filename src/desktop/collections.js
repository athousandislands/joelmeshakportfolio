export function createCollections({ allProjectsData, buildMediaData, Assets, V, Loop, Router, REDUCED_MOTION, gsap, clamp, fitDistance, visibleSizeAt, posterFor, IDLE_PRELOAD }) {
    const S2 = (() => {
        const FOV = 45;
        const HALF_TAN = Math.tan(FOV * Math.PI / 360);

        const CARD_W = 5.94;
        const CARD_H = 4.32;
        const CARD_RADIUS = 0.4;
        const GAP_X_RATIO = 1.30;
        const GAP_Y_RATIO = 1.65;
        const TITLE_OFFSET = 3.6;

        const GRID_PAD = 0.15;
        const GRID_PAD_COMPACT = 0.28;

        const STATE = { CLUSTERED: 1, OPENING: 2, CAROUSEL: 3, CLOSING: 4 };

        /* An IntersectionObserver drives playback uniformly on desktop and touch.
           Hover was tried and removed — #click-blocker sits above #dom-layer
           in the same stacking context, so no per-card z-index could put a
           video above it, and mouseenter could never reach a projected card.
           The top card (index 0) of any cluster is an autoplay anchor and
           always claims a playback slot, so single-video clusters (most of
           them) play continuously with no interaction needed. */
        const MAX_CONCURRENT_VIDEOS = 2;
        let videoObserver = null;
        const playingVideos = [];   // membership only; cap is enforced by reconcileVideoPlayback

        const dom = {
            root: document.getElementById('scene-two'),
            layer: document.getElementById('dom-layer'),
            scroller: document.getElementById('native-scroll-container'),
            scrollContent: document.getElementById('native-scroll-content'),
            blocker: document.getElementById('click-blocker'),
            info: document.getElementById('collection-info'),
            infoTitle: document.getElementById('info-title'),
            infoDesc: document.getElementById('info-desc'),
            closeBtn: document.getElementById('close-btn'),
            backBtn: document.getElementById('scene-two-back-btn')
        };

        const cache = {};
        let clusters = [];
        let mediaData = [];
        let activeProject = -1;

        const cam = { z: 20, y: 0 };
        let focal = 1;
        let baseScale = 1;
        let rasterScale = 1;
        let initialCamY = 0;
        let maxScrollPx = 0;
        let scrollAtOpen = 0;

        let state = STATE.CLUSTERED;
        let activeCluster = -1;
        let openProgress = 0;
        let arrival = 0;
        let carouselPos = 0;
        let carouselTarget = 0;
        let carouselScale = 1;
        let carouselZ = 0;
        let layoutDirty = true;
        let projecting = false;
        let transitionTween = null;
        let arrivalTween = null;
        let queuedOpen = -1;
        let projectedCluster = -1;

        /* FIX 9b: measured ONCE per open, not read inside the render loop.
           layoutCarousel() previously called dom.info.getBoundingClientRect()
           from inside frame(), immediately after GSAP's ticker had written styles
           in the same frame — a textbook forced-synchronous-layout thrash. */
        let infoSafeTop = 0;

        let lastScrollOpacity = -1;

        /* ---------- projector ---------- */
        const scaleAt = (z) => focal / (cam.z - z);
        const screenX = (x, z) => V.width / 2 + x * scaleAt(z);
        const screenY = (y, z) => V.height / 2 - (y - cam.y) * scaleAt(z);
        const worldXAtPx = (px, z) => (px - V.width / 2) / scaleAt(z);
        const worldYAtPx = (py, z) => cam.y + (V.height / 2 - py) / scaleAt(z);

        /* ---------- construction (lazy, per project) ---------- */
        function buildProject(index) {
            if (cache[index]) return cache[index];

            const project = allProjectsData[index];
            const md = buildMediaData(project);
            const cardScale = project.cardScale || 1.0;
            const built = [];

            md.forEach((clusterData, clusterIndex) => {
                const cards = clusterData.assets.map((media, j) => {
                    const el = document.createElement('div');
                    el.className = 'dom-card';
                    if (j === 0) {
                        el.setAttribute('role', 'button');
                        el.tabIndex = 0;
                        el.setAttribute('aria-label', 'Open ' + clusterData.title);
                        el.addEventListener('keydown', event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                if (state === STATE.CLOSING) queuedOpen = clusterIndex;
                                else open(clusterIndex);
                            }
                        });
                    }

                    let mediaEl;
                    if (media.type === 'video') {
                        el.classList.add('is-video');
                        mediaEl = document.createElement('video');
                        mediaEl.loop = true;
                        mediaEl.muted = true;
                        mediaEl.playsInline = true;
                        mediaEl.setAttribute('playsinline', '');
                        mediaEl.preload = IDLE_PRELOAD(media.src);
                        const poster = posterFor(media.src);
                        if (poster) mediaEl.poster = poster;
                        mediaEl.src = media.src;
                        mediaEl.addEventListener('loadedmetadata', function () {
                            Assets.setDims(media.src, this.videoWidth, this.videoHeight);
                        });
                    } else {
                        mediaEl = document.createElement('img');
                        mediaEl.decoding = 'async';
                        mediaEl.alt = clusterData.title + ' — artwork ' + (j + 1);
                        mediaEl.addEventListener('load', function () {
                            Assets.setDims(media.src, this.naturalWidth, this.naturalHeight);
                        });
                    }

                    el.appendChild(mediaEl);

                    let baseRotZ = 0;
                    const n = clusterData.assets.length;
                    if (n >= 3) {
                        if (j === 0) baseRotZ = 14 * Math.PI / 180;
                        else if (j === 1) baseRotZ = -14 * Math.PI / 180;
                    } else if (n === 2 && j === 0) {
                        baseRotZ = 10 * Math.PI / 180;
                    }

                    const card = {
                        el, mediaEl,
                        src: media.src,
                        isVideo: media.type === 'video',
                        playing: false,
                        clusterIndex,
                        /* `wanted` gates whether this card's <img> gets a src at all — only
                           each cluster's three covers at project load, the rest
                           unlocked on open. Splits decode from download; the
                           prefetch itself is unchanged. */
                        wanted: false,
                        srcApplied: '',
                        srcNeeded: 0,
                        index: j,
                        baseRotZ,
                        wWorld: CARD_W * cardScale,
                        hWorld: CARD_H * cardScale,
                        cx: 0, cy: 0,
                        gridX: 0, gridY: 0,
                        lastTransform: '',
                        lastOpacity: -1,
                        lastDisplay: '',
                        lastZ: -1,
                        lastW: -1, lastH: -1
                    };

                    return card;
                });

                const titleEl = document.createElement('div');
                titleEl.className = 'cluster-title';
                titleEl.textContent = clusterData.title;

                built.push({
                    cards,
                    titleEl,
                    home: { x: 0, y: 0 },
                    maxScroll: 0,
                    lastTitleTransform: '',
                    lastTitleOpacity: -1
                });
            });

            cache[index] = { clusters: built, mediaData: md, cardScale };
            return cache[index];
        }

        /* ---------- card world size from resolved aspect ---------- */
        function sizeCard(card, cardScale) {
            const boxW = CARD_W * cardScale;
            const boxH = CARD_H * cardScale;
            const d = Assets.get(card.src);
            if (!d) { card.wWorld = boxW; card.hWorld = boxH; return; }
            const boxAspect = boxW / boxH;
            if (d.aspect < boxAspect) {
                card.hWorld = boxH;
                card.wWorld = boxH * d.aspect;
            } else {
                card.wWorld = boxW;
                card.hWorld = boxW / d.aspect;
            }
        }

        function maxCarouselScale(cardScale) {
            const padSide = V.width * 0.06;
            if (V.compact) return (V.width - padSide * 2) / (CARD_W * cardScale);
            const generousTop = V.height * 0.18;
            const padBottom = V.height * 0.08;
            return Math.min(
                (V.height - generousTop - padBottom) / (CARD_H * cardScale),
                (V.width - padSide * 2) / (CARD_W * cardScale)
            );
        }

        /* ---------- grid layout (runs on resize, not on scroll) ---------- */
        function layoutGrid() {
            const cols = V.columns;
            const cardScale = cache[activeProject] ? cache[activeProject].cardScale : 1;

            const gapX = (CARD_W * cardScale) * GAP_X_RATIO;
            const gapY = (CARD_H * cardScale) * GAP_Y_RATIO;

            const baseTitleOffset = V.compact ? TITLE_OFFSET * 0.75 : TITLE_OFFSET;
            const titleOffset = baseTitleOffset * cardScale;

            const rows = Math.ceil(clusters.length / cols) || 1;

            const frameRows = cols === 1 ? 1 : 2;
            const pad = V.compact ? GRID_PAD_COMPACT : GRID_PAD;

            const frameCardW = V.compact ? CARD_W * cardScale : CARD_W;
            const frameCardH = V.compact ? CARD_H * cardScale : CARD_H;
            const frameW = (cols - 1) * gapX + frameCardW;
            const frameH = (frameRows - 1) * gapY + frameCardH + titleOffset;

            cam.z = fitDistance(frameW, frameH, FOV, pad);
            focal = (V.height / 2) / HALF_TAN;
            baseScale = scaleAt(0);

            rasterScale = Math.max(baseScale, maxCarouselScale(cardScale));

            const visible = visibleSizeAt(cam.z, FOV);
            const startX = -((cols - 1) * gapX) / 2;

            clusters.forEach((c, i) => {
                c.cards.forEach(card => sizeCard(card, cardScale));
                c.home.x = startX + (i % cols) * gapX;
                c.home.y = -Math.floor(i / cols) * gapY;
            });

            const contentTop = (CARD_H * cardScale) / 2;
            const contentBottom = -(rows - 1) * gapY - (CARD_H * cardScale) / 2 - titleOffset;
            const contentH = contentTop - contentBottom;
            const padY = visible.h * 0.10;

            if (contentH + padY * 2 <= visible.h) {
                initialCamY = (contentTop + contentBottom) / 2;
                maxScrollPx = 0;
            } else {
                initialCamY = contentTop + padY - visible.h / 2;
                maxScrollPx = (contentH + padY * 2 - visible.h) * baseScale;
            }

            dom.scrollContent.style.height = (V.height + maxScrollPx) + 'px';
            applyScroll(dom.scroller.scrollTop);

            const contentY = (yWorld) => V.height / 2 - (yWorld - initialCamY) * baseScale;

            clusters.forEach((c) => {
                const cx = screenX(c.home.x, 0);
                const cy = contentY(c.home.y);
                c.cards.forEach(card => {
                    card.gridX = cx;
                    card.gridY = cy;
                    if (!projecting) {
                        card.el.style.left = cx + 'px';
                        card.el.style.top = cy + 'px';
                    }
                });
                c.titleEl.style.left = cx + 'px';
                c.titleEl.style.top = contentY(c.home.y - titleOffset) + 'px';
                c.titleEl.style.transform = 'translate(-50%, -50%)';
            });

            sizeElements();
            if (!projecting) writeGridTransforms();
        }

        function sizeElements() {
            clusters.forEach(c => {
                c.cards.forEach(card => {
                    const w = Math.round(card.wWorld * rasterScale);
                    const h = Math.round(card.hWorld * rasterScale);
                    if (w !== card.lastW || h !== card.lastH) {
                        card.el.style.width = w + 'px';
                        card.el.style.height = h + 'px';
                        card.el.style.borderRadius = (CARD_RADIUS * rasterScale).toFixed(1) + 'px';
                        card.lastW = w; card.lastH = h;
                    }
                    if (!card.isVideo && card.wanted) {
                        const needed = card.wWorld * rasterScale;
                        if (needed > card.srcNeeded) {
                            const url = Assets.urlFor(card.src, needed);
                            if (url !== card.srcApplied) {
                                card.srcApplied = url;
                                card.srcNeeded = needed;
                                card.mediaEl.src = url;
                            }
                        }
                    }
                });
            });
        }

        function writeGridTransforms() {
            const s = baseScale / rasterScale;
            clusters.forEach((c, i) => {
                const clusterStagger = i * 0.08;
                const dur = 1 + clusters.length * 0.08;
                const ap = clamp(arrival * dur - clusterStagger, 0, 1);
                const ease = 1 - Math.pow(1 - ap, 3);
                const scale = s * (0.85 + 0.15 * ease);

                c.cards.forEach((card, j) => {
                    const display = j < 3 ? 'flex' : 'none';
                    if (display !== card.lastDisplay) {
                        card.el.style.display = display;
                        card.lastDisplay = display;
                    }
                    if (display === 'none') return;

                    if (ease !== card.lastOpacity) {
                        card.el.style.opacity = ease;
                        card.lastOpacity = ease;
                    }
                    const t = `translate(-50%, -50%) scale(${scale.toFixed(4)}) rotateZ(${(-card.baseRotZ).toFixed(4)}rad)`;
                    if (t !== card.lastTransform) {
                        card.el.style.transform = t;
                        card.lastTransform = t;
                    }
                    const zi = 500 + i * 100 + (c.cards.length - j);
                    if (zi !== card.lastZ) { card.el.style.zIndex = zi; card.lastZ = zi; }
                });

                if (c.lastTitleOpacity !== 1) { c.titleEl.style.opacity = 1; c.lastTitleOpacity = 1; }
            });
        }

        function applyScroll(px) {
            cam.y = initialCamY - clamp(px, 0, maxScrollPx) / baseScale;
        }

        /* ---------- decode gating (item 3) ---------- */

        /* Unlock decoding for a whole cluster. Called when the cluster is opened,
           i.e. at the start of a ~1s animation — ample runway when the bytes are
           already in the HTTP cache from Assets.prefetchProject. */
        function ensureClusterDecoded(index) {
            const c = clusters[index];
            if (!c) return;
            let changed = false;
            c.cards.forEach(card => {
                if (!card.wanted) { card.wanted = true; changed = true; }
            });
            if (changed) sizeElements();
        }

        /* ---------- video playback ---------- */
        function startVideo(card) {
            if (!card.isVideo || card.playing) return;
            card.playing = true;
            card.mediaEl.preload = 'auto';
            const p = card.mediaEl.play();
            if (p && p.catch) p.catch(() => { card.playing = false; });
            if (playingVideos.indexOf(card) === -1) playingVideos.push(card);
        }

        /* Pause WITHOUT rewinding: returning the pointer/scroll resumes where it
           left off, unless reset is requested (used when actually leaving). */
        function stopVideo(card, reset = false) {
            const i = playingVideos.indexOf(card);
            if (i !== -1) playingVideos.splice(i, 1);
            if (card.playing) {
                card.playing = false;
                card.mediaEl.pause();
            }
            if (reset) {
                try { card.mediaEl.currentTime = 0; } catch (e) { /* not seekable yet */ }
                card.mediaEl.preload = IDLE_PRELOAD(card.src);
            }
        }

        /* Leaving ONE cluster (closing it) resets only that cluster's clips.
           Other clusters' ambient top-card playback is untouched. */
        function resetClusterVideos(index) {
            const c = clusters[index];
            if (!c) return;
            c.cards.forEach(card => { if (card.isVideo) stopVideo(card, true); });
        }

        /* Leaving the whole project resets everything. */
        function resetAllVideos() {
            clusters.forEach(c => c.cards.forEach(card => {
                if (card.isVideo) stopVideo(card, true);
            }));
            playingVideos.length = 0;
        }

        /* Single source of truth for the cap: recomputes the target playing set
           and diffs against reality, stopping before starting so
           MAX_CONCURRENT_VIDEOS is never exceeded even momentarily. Open
           cluster: every card in it is a candidate, top card prioritized.
           Resting grid: only each cluster's top card is a candidate. */
        function reconcileVideoPlayback() {
            if (document.hidden) { playingVideos.slice().forEach(card => stopVideo(card)); return; }
            let candidates;
            if (activeCluster !== -1) {
                const c = clusters[activeCluster];
                candidates = c ? c.cards.filter(card => card.isVideo) : [];
            } else {
                candidates = clusters
                    .map(c => c.cards[0])
                    .filter(card => card && card.isVideo);
            }

            const visible = candidates.filter(card => (card.el._visRatio || 0) > 0.4);
            visible.sort((a, b) => {
                const aTop = a.index === 0 ? 1 : 0;
                const bTop = b.index === 0 ? 1 : 0;
                if (aTop !== bTop) return bTop - aTop;
                return (b.el._visRatio || 0) - (a.el._visRatio || 0);
            });

            const shouldPlay = new Set(visible.slice(0, MAX_CONCURRENT_VIDEOS));
            playingVideos.slice().forEach(card => { if (!shouldPlay.has(card)) stopVideo(card); });
            shouldPlay.forEach(card => { if (!card.playing) startVideo(card); });
        }

        function ensureVideoObserver() {
            if (videoObserver || typeof IntersectionObserver === 'undefined') return;
            videoObserver = new IntersectionObserver((entries) => {
                entries.forEach(e => { e.target._visRatio = e.intersectionRatio; });
                reconcileVideoPlayback();
            }, { threshold: [0, 0.25, 0.4, 0.6, 0.8, 1] });
        }

        /* Called once per project load: the top card of every video-bearing
           cluster is watched for the lifetime of the project, so ambient
           playback works in the resting grid without the user opening anything. */
        function observeTopCards() {
            ensureVideoObserver();
            if (!videoObserver) return;
            clusters.forEach(c => {
                const top = c.cards[0];
                if (top && top.isVideo) videoObserver.observe(top.el);
            });
        }

        /* Called on open(): extends observation to the rest of that cluster's
           video cards (idempotent — re-observing the top card is a no-op). */
        function observeClusterVideos(index) {
            ensureVideoObserver();
            if (!videoObserver) return;
            const c = clusters[index];
            if (!c) return;
            c.cards.forEach(card => { if (card.isVideo) videoObserver.observe(card.el); });
        }

        function unobserveVideos() {
            if (videoObserver) videoObserver.disconnect();
        }

        /* ---------- carousel layout ---------- */
        function measureInfoSafeTop() {
            const infoRect = dom.info.getBoundingClientRect();
            const gap = V.height * 0.035;
            infoSafeTop = Math.max(infoRect.bottom + gap, V.height * 0.12);
        }

        function layoutCarousel(clusterIndex) {
            const c = clusters[clusterIndex];
            if (!c) return;

            const safeTop = infoSafeTop || V.height * 0.12;
            const padSide = V.width * 0.06;
            const padBottom = V.height * 0.08;

            const cardScale = cache[activeProject] ? cache[activeProject].cardScale : 1;
            c.cards.forEach(card => sizeCard(card, cardScale));

            let targetScale;
            if (V.compact) {
                targetScale = (V.width - padSide * 2) / (CARD_W * cardScale);
            } else {
                targetScale = Math.min(
                    (V.height - safeTop - padBottom) / (CARD_H * cardScale),
                    (V.width - padSide * 2) / (CARD_W * cardScale)
                );
            }

            const minDistance = cam.z * 0.22;
            targetScale = Math.min(targetScale, focal / minDistance, rasterScale);
            carouselScale = targetScale;
            carouselZ = cam.z - focal / targetScale;

            const gapPx = V.compact ? V.height * 0.014 : V.width * 0.018;
            let overflowPx = 0;

            if (V.compact) {
                let cursor = safeTop;
                c.cards.forEach(card => {
                    const hpx = card.hWorld * targetScale;
                    card.cx = 0;
                    card.cy = worldYAtPx(cursor + hpx / 2, carouselZ) - cam.y;
                    cursor += hpx + gapPx;
                });
                cursor -= gapPx;
                overflowPx = Math.max(0, cursor + padBottom - V.height);
            } else {
                const bandCenter = (safeTop + (V.height - padBottom)) / 2;
                const cyWorld = worldYAtPx(bandCenter, carouselZ) - cam.y;
                let cursor = padSide;
                c.cards.forEach(card => {
                    const wpx = card.wWorld * targetScale;
                    card.cx = worldXAtPx(cursor + wpx / 2, carouselZ);
                    card.cy = cyWorld;
                    cursor += wpx + gapPx;
                });
                cursor -= gapPx;
                overflowPx = Math.max(0, cursor + padSide - V.width);
            }

            c.maxScroll = overflowPx / targetScale;
            carouselTarget = clamp(carouselTarget, 0, c.maxScroll);
            carouselPos = clamp(carouselPos, 0, c.maxScroll);
        }

        function relayout() {
            if (!clusters.length) return;
            layoutGrid();
            if (activeCluster !== -1) {
                measureInfoSafeTop();
                layoutCarousel(activeCluster);
            }
        }

        /* ---- reparenting ----
           Only the opening cluster is promoted/projected; the rest of the
           grid fades as one composited group via #native-scroll-content.
           Previously every card in every cluster got will-change + a reparent
           on the same frame — ~20-30 layer creations for cards immediately
           hidden again a frame later. That was the open-transition stutter. */
        function enterProjected(idx) {
            projecting = true;
            projectedCluster = idx;
            dom.scrollContent.classList.add('fading');
            const c = clusters[idx];
            c.cards.forEach(card => {
                card.el.classList.add('animating');
                card.el.style.left = '0px';
                card.el.style.top = '0px';
                if (card.lastDisplay !== 'flex') {
                    card.el.style.display = 'flex';
                    card.lastDisplay = 'flex';
                }
                card.lastTransform = '';
                card.lastOpacity = -1;
                card.lastZ = -1;
                dom.layer.appendChild(card.el);
            });
        }

        function exitProjected(idx) {
            projecting = false;
            projectedCluster = -1;
            const c = clusters[idx];
            if (c) {
                c.cards.forEach(card => {
                    card.el.classList.remove('animating');
                    card.el.style.left = card.gridX + 'px';
                    card.el.style.top = card.gridY + 'px';
                    card.lastTransform = '';
                    card.lastOpacity = -1;
                    dom.scrollContent.appendChild(card.el);
                });
            }
            dom.scrollContent.classList.remove('fading');
            dom.scrollContent.style.opacity = '';
            lastScrollOpacity = -1;
            writeGridTransforms();
        }

        /* ---------- project activation / deactivation ---------- */
        function deactivateCurrent() {
            if (activeProject === -1 || !cache[activeProject]) return;
            unobserveVideos();
            resetAllVideos();
            cache[activeProject].clusters.forEach(c => {
                c.cards.forEach(card => {
                    if (card.el.parentNode) card.el.parentNode.removeChild(card.el);
                    card.lastDisplay = '';
                });
                if (c.titleEl.parentNode) c.titleEl.parentNode.removeChild(c.titleEl);
            });
        }

        function load(index) {
            if (activeCluster !== -1) close(true);
            deactivateCurrent();

            const rec = buildProject(index);
            activeProject = index;
            clusters = rec.clusters;
            mediaData = rec.mediaData;
            projecting = false;
            projectedCluster = -1;

            clusters.forEach(c => {
                c.cards.forEach((card, j) => {
                    /* Only the three covers are decoded up front (item 3). */
                    if (j < 3) card.wanted = true;
                    card.el.classList.remove('animating');
                    card.lastTransform = '';
                    card.lastOpacity = -1;
                    card.lastDisplay = '';
                    card.lastW = -1;
                    dom.scrollContent.appendChild(card.el);
                });
                c.titleEl.style.opacity = 1;
                c.lastTitleOpacity = 1;
                dom.scrollContent.appendChild(c.titleEl);
            });

            dom.scroller.style.display = 'block';
            dom.scroller.style.overflowY = 'auto';
            dom.scroller.scrollTop = 0;

            state = STATE.CLUSTERED;
            activeCluster = -1;
            openProgress = 0;
            carouselPos = carouselTarget = 0;

            /* Watch every cluster's top card for the lifetime of this project, so
               a single-video cluster (most of them) just plays continuously
               once it's visible — grid or carousel, no interaction needed. */
            observeTopCards();

            relayout();

            arrival = 0;
            if (REDUCED_MOTION) {
                arrival = 1;
                writeGridTransforms();
            } else {
                const proxy = { v: 0 };
                arrivalTween = gsap.to(proxy, {
                    v: 1, duration: 1.44, ease: 'power3.out',
                    onUpdate: () => { arrival = proxy.v; if (!projecting) writeGridTransforms(); }
                });
            }
        }

        function unload() {
            deactivateCurrent();
            dom.scroller.style.display = 'none';
        }

        /* ---------- open / close ---------- */
        function open(index) {
            if (activeCluster !== -1) return;
            arrivalTween?.kill();
            arrival = 1;
            writeGridTransforms();
            activeCluster = index;

            const data = mediaData[index];
            dom.infoTitle.textContent = data.title;
            dom.infoDesc.innerHTML = data.description;

            /* Unlock decoding for this cluster's non-cover images (item 3). */
            ensureClusterDecoded(index);

            /* One deliberate synchronous measurement, taken here and cached for
               the whole open/carousel/close cycle. */
            measureInfoSafeTop();

            scrollAtOpen = dom.scroller.scrollTop;
            applyScroll(scrollAtOpen);
            carouselPos = carouselTarget = 0;
            layoutCarousel(index);

            dom.scroller.style.overflowY = 'hidden';
            dom.blocker.classList.add('active');
            dom.info.classList.add('active');
            dom.closeBtn.classList.add('active');
            dom.backBtn.classList.remove('active');

            enterProjected(index);
            /* Extends observation from just the top card to every video card in
               this cluster. If the top card was already playing ambiently in the
               grid, it keeps playing right through this transition — nothing
               restarts. The rest join as their IntersectionObserver entries
               arrive (typically within a frame). */
            observeClusterVideos(index);
            reconcileVideoPlayback();

            state = STATE.OPENING;
            openProgress = 0;
            const dur = REDUCED_MOTION ? 0 : (V.compact ? 0.8924 : 1.0476);
            const proxy = { v: 0 };
            transitionTween = gsap.to(proxy, {
                v: 1, duration: dur, ease: 'power4.inOut',
                onUpdate: () => { openProgress = proxy.v; },
                onComplete: () => { state = STATE.CAROUSEL; }
            });
        }

        function close(instant = false) {
            if (activeCluster === -1 || (state === STATE.CLOSING && !instant)) return;
            transitionTween?.kill();
            queuedOpen = -1;

            const closing = activeCluster;

            dom.closeBtn.classList.remove('active');
            dom.backBtn.classList.add('active');
            dom.scroller.style.overflowY = 'auto';
            state = STATE.CLOSING;

            /* Leaving THIS cluster resets its own clips. Other clusters' ambient
               top-card playback is untouched — closing one carousel shouldn't
               interrupt an unrelated video quietly looping in the grid. */
            resetClusterVideos(closing);

            if (instant) {
                dom.info.classList.remove('active');
                dom.blocker.classList.remove('active');
                openProgress = 0;
                carouselPos = carouselTarget = 0;
                state = STATE.CLUSTERED;
                activeCluster = -1;
                exitProjected(closing);
                reconcileVideoPlayback();
                return;
            }

            /* Both halves of the return run concurrently now (were sequential: scroll
               back, then collapse — two visible snaps). Cards past index 3
               fade to transparent as part of the same motion, so what
               remains at settle is already just the 3-card stack. */
            const tl = transitionTween = gsap.timeline({
                defaults: { ease: 'power2.inOut' },
                onComplete: () => {
                    openProgress = 0;
                    carouselPos = carouselTarget = 0;
                    frame(); // Paint the exact resting pose before changing parents.
                    state = STATE.CLUSTERED;
                    activeCluster = -1;
                    carouselPos = carouselTarget = 0;
                    exitProjected(closing);
                    reconcileVideoPlayback();
                    if (queuedOpen !== -1) {
                        const next = queuedOpen;
                        queuedOpen = -1;
                        open(next);
                    }
                }
            });

            if (!REDUCED_MOTION && carouselPos > 0.01) {
                const proxy = { v: carouselPos };
                tl.to(proxy, {
                    v: 0, duration: V.compact ? 0.441 : 0.63,
                    onUpdate: () => { carouselPos = carouselTarget = proxy.v; }
                }, 0);
            } else {
                carouselPos = carouselTarget = 0;
            }

            tl.call(() => {
                dom.info.classList.remove('active');
                dom.blocker.classList.remove('active');
            }, null, 0);

            const proxy2 = { v: openProgress };
            tl.to(proxy2, {
                v: 0,
                duration: REDUCED_MOTION ? 0 : (V.compact ? 0.56 : 0.7),
                ease: 'power2.out',
                onUpdate: () => { openProgress = proxy2.v; }
            }, 0);
        }

        function applyCarouselDelta(deltaPx) {
            if (!isFinite(deltaPx) || activeCluster === -1 || state === STATE.CLOSING) return;
            const c = clusters[activeCluster];
            const speed = V.compact ? 2.0 : 1.2;
            carouselTarget = clamp(carouselTarget + (deltaPx / carouselScale) * speed, 0, c.maxScroll);
        }

        /* ---------- hit testing ---------- */
        function hitTest(px, py) {
            for (let i = 0; i < clusters.length; i++) {
                const c = clusters[i];
                const cx = screenX(c.home.x, 0);
                const cy = screenY(c.home.y, 0);
                const hw = (CARD_W * 1.5 * baseScale) / 2;
                const hh = (CARD_H * 1.5 * baseScale) / 2;
                if (px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh) return i;
            }
            return -1;
        }

        /* ---------- frame (projected states only) ---------- */
        const FIXED_STAGGER = 0.24;

        function frame() {
            if (layoutDirty) { layoutDirty = false; relayout(); }
            if (!projecting) return;

            if (state === STATE.CAROUSEL) {
                carouselPos += (carouselTarget - carouselPos) * 0.10;
            }

            if (state === STATE.CAROUSEL || state === STATE.CLOSING) {
                const off = -carouselPos * carouselScale;
                dom.info.style.transform = V.compact
                    ? `translate3d(-50%, ${off}px, 0)`
                    : `translate3d(${off}px, 0, 0)`;
            } else {
                dom.info.style.transform = V.compact ? 'translate3d(-50%, 0, 0)' : 'translate3d(0, 0, 0)';
            }

            /* The whole un-opened grid fades as ONE layer (FIX 6). */
            const gridOpacity = +(1 - openProgress).toFixed(3);
            if (gridOpacity !== lastScrollOpacity) {
                dom.scrollContent.style.opacity = gridOpacity;
                lastScrollOpacity = gridOpacity;
            }

            const i = projectedCluster;
            const c = clusters[i];
            if (!c) return;

            const rasterRatio = 1 / rasterScale;
            const n = c.cards.length;
            const durationMul = 1 + FIXED_STAGGER;
            const stagger = n > 1 ? FIXED_STAGGER / (n - 1) : 0;

            for (let j = 0; j < n; j++) {
                const card = c.cards[j];
                const startX = c.home.x;
                const startY = c.home.y;
                const startZ = 0; // The resting grid uses one scale/depth for every card.

                const p = clamp(openProgress * durationMul - j * stagger, 0, 1);
                const arc = Math.sin(p * Math.PI) * Math.min(2.0, cam.z * 0.12);

                const endX = V.compact ? card.cx : card.cx - carouselPos;
                const endY = V.compact ? (cam.y + card.cy + carouselPos) : (cam.y + card.cy);
                const x = startX + (endX - startX) * p;
                const y = startY + (endY - startY) * p;
                const z = startZ + (carouselZ - startZ) * p + arc;
                const rot = card.baseRotZ * (1 - p);

                /* Cards beyond the resting 3-stack fade as they collapse (p: 1=carousel,
                   0=home) instead of a display:none snap. Higher-index cards
                   arrive earliest, so everything else has faded out by the
                   time the stack settles. CLOSING only; open is unchanged. */
                const opacity = (state === STATE.CLOSING && j >= 3) ? p : 1;
                if (card.lastOpacity !== opacity) { card.el.style.opacity = opacity; card.lastOpacity = opacity; }
                if (card.lastDisplay !== 'flex') { card.el.style.display = 'flex'; card.lastDisplay = 'flex'; }

                const s = scaleAt(z) * rasterRatio;
                const sx = screenX(x, z);
                const sy = screenY(y, z);
                if (!isFinite(sx) || !isFinite(sy) || !isFinite(s)) continue;

                const transform =
                    `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) ` +
                    `scale(${s.toFixed(4)}) rotateZ(${(-rot).toFixed(4)}rad)`;
                if (transform !== card.lastTransform) {
                    card.el.style.transform = transform;
                    card.lastTransform = transform;
                }

                const zi = 2000 + i * 100 + (n - j);
                if (zi !== card.lastZ) { card.el.style.zIndex = zi; card.lastZ = zi; }
            }
        }

        /* ---------- events ---------- */
        dom.scroller.addEventListener('scroll', () => {
            if (Router.scene !== 2 || (projecting && state !== STATE.CLOSING)) return;
            applyScroll(dom.scroller.scrollTop);
        }, { passive: true });

        dom.scroller.addEventListener('click', (e) => {
            if (Router.scene !== 2 || (activeCluster !== -1 && state !== STATE.CLOSING)) return;
            const hit = hitTest(e.clientX, e.clientY);
            if (hit === -1) return;
            if (state === STATE.CLOSING) queuedOpen = hit;
            else open(hit);
        });

        dom.closeBtn.addEventListener('click', () => close());
        dom.closeBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
        });

        /* FIX 9a: a full relayout per resolved image meant ~20-60 grid relayouts
           while a project's images streamed in — each one rewriting width/height/
           radius on every card. Trailing debounce collapses that to one. */
        let resolveTimer = null;
        Assets.onResolve(() => {
            if (activeProject === -1) return;
            clearTimeout(resolveTimer);
            resolveTimer = setTimeout(() => { layoutDirty = true; }, 150);
        });

        V.onChange(() => { if (activeProject !== -1) layoutDirty = true; });

        document.addEventListener('visibilitychange', reconcileVideoPlayback);
        Loop.register(2, frame);

        return {
            load, unload, close,
            dispose() {
                transitionTween?.kill();
                arrivalTween?.kill();
                clearTimeout(resolveTimer);
                resetAllVideos();
                videoObserver?.disconnect();
                Object.values(cache).forEach(record => record.clusters.forEach(cluster => cluster.cards.forEach(card => {
                    if (card.isVideo) {
                        card.mediaEl.removeAttribute('src');
                        card.mediaEl.load();
                    }
                })));
            },
            applyCarouselDelta,
            get activeCluster() { return activeCluster; },
            markDirty() { layoutDirty = true; }
        };
    })();
    return S2;
}

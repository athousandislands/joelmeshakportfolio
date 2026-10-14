import { createPreparation } from '../shared/preparation.js';

export function createMindMap({ THREE, OrbitControls, KTX2Loader, V, renderer, Governor, guardContext, Assets, Idle, Loop, REDUCED_MOTION, gsap, clamp, mix }, options = {}) {
    const MINDMAP = {
        useKTX2: true,
        ktx2Dir: 'assets/projects/mind-map/gallery/ktx2/',
        transcoderPath: 'assets/vendor/basis/',
        transcoderFallback: 'https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/'
    };

    const resolvedTranscoderPath = MINDMAP.transcoderPath;
    const transcoderReady = Promise.resolve();

    const Scene3 = (() => {
        const MM_FOV = 60;
        const GLOBE_RADIUS = 2.4;

        const container3 = options.container || document.getElementById('mindmap-canvas-container');
        const loadingEl = options.loading || document.getElementById('mindmap-loading');

        const imageFiles = [
            "1.jpeg","2.jpeg","3.png","4.jpeg","5.jpeg","6.jpeg","7.png","8.jpeg","9.jpeg","10.jpeg",
            "11.jpeg","12.jpeg","13.jpeg","14.png","15.png","16.jpeg","17.jpeg","18.jpeg","19.jpeg","20.jpeg",
            "21.JPG","22.JPG","23.JPG","24.JPG","25.jpeg","26.jpeg","27.jpeg","28.jpeg","29.jpeg","30.jpeg",
            "31.jpeg","32.jpeg","33.jpeg","34.jpeg","35.jpeg","36.jpeg","37.jpeg","38.jpeg","39.jpeg","40.jpeg",
            "41.jpeg","42.jpeg","43.jpeg","44.jpeg","45.jpeg","46.jpeg","47.jpeg","48.jpeg","49.jpeg","50.jpeg",
            "51.jpeg","52.jpeg","53.jpeg","54.jpeg","55.jpeg","56.jpeg","57.jpeg","58.jpeg","59.jpeg","60.jpeg",
            "61.jpeg","62.jpeg","63.jpeg","64.jpeg","65.jpeg","66.png","67.jpeg","68.jpeg","69.jpeg","70.jpeg",
            "71.jpeg","72.jpeg","73.jpeg","74.jpeg","75.jpeg","76.jpeg"
        ];
        const allImagePaths = imageFiles.map(f => `assets/projects/mind-map/gallery/${f}`);
        const allKtx2Paths = imageFiles.map(f => `${MINDMAP.ktx2Dir}${f.replace(/\.[^.]+$/, '')}.ktx2`);
        const FULL_N = imageFiles.length;

        /* ---- TILE SET ---------------------------------------------------------
           Desktop renders every tile. The random 33-of-76 subset that used
           to be selected here for LOW_POWER devices is gone — it was the single
           thing making an iPad Mini's mind map visibly poorer than a desktop's,
           and it is not being replaced with a narrower condition. */
        const N = Math.min(options.tileCount || FULL_N, FULL_N);
        const indices = Array.from({ length: N }, (_, i) => Math.floor(i * FULL_N / N));
        const imagePaths = indices.map(i => allImagePaths[i]);
        const ktx2Paths = indices.map(i => allKtx2Paths[i]);

        /* ---- DENSITY --------------------------------------------------------
           With the reduced subset gone, the sphere always carries the full tile
           count, so the DENSITY_SCALE compensation that used to inflate tile
           size and effect radius for a sparser sphere is gone with it. These are
           the values the full/desktop set was always tuned against. */
        const TILE = options.tileSize || 0.78;
        const EFFECT_RADIUS_BASE = 1.8;
        const EFFECT_RADIUS_HOLD = 0.7;

        /* ---- MASS BREATHING ENVELOPE ----
           One scalar per frame (not per tile), multiplying the globe's
           resting radius on top of the existing per-tile idle pulse. Two
           sines from the same `time`: BREATH_RATE is the breath, SWELL_RATE
           a slower envelope on its amplitude, so it opens over a couple of
           breaths and closes again. Pure function of time — nothing
           accumulates, hard-bounded to [MASS_BREATH_MIN, MASS_BREATH_MAX] by
           construction. Two Math.sin calls per frame, total. */
        const MASS_BREATH_MIN = 0.988;
        const MASS_BREATH_MAX = 1.032;
        const BREATH_RATE = 0.32;   /* rad/s — ~20s per breath */
        const SWELL_RATE  = 0.085;  /* rad/s — ~74s, about three breaths */

        /* Scene graph objects that are cheap and stateless live here; anything
           holding GPU memory is created in mount(). */
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xCCCCCC, 0.03);
        const camera = new THREE.PerspectiveCamera(MM_FOV, V.aspect, 0.1, 1000);

        let rendererMM = null;
        let controls = null;
        let ktx2Loader = null;
        let glGuard = null;
        let globe = null;
        let hitSphere = null;
        let tileGeo = null;
        let unsubViewport = null;

        /* PERSISTENT across mount/unmount. Transcoding is the expensive step, so
           the prepared textures outlive the renderer: leaving and re-entering the
           mind map re-uploads from data already in memory rather than
           re-downloading and re-transcoding. Costs ~11MB (mobile) / ~26MB
           (desktop) resident, well under the levels that were causing trouble. */
        const textures = new Array(N);
        const failedTiles = new Set();
        let preparedCount = 0;
        let summaryLogged = false;

        let tiles = [];
        let uploadQueue = [];
        let uploadedCount = 0;
        let ktx2Hits = 0, ktx2Misses = 0, ktx2Errors = 0, ktx2Disabled = false;
        let revealed = false;
        let revealTween = null;
        let revealTimeout = null;
        let mounted = false;


        const TILE_OPACITY = 0.95;
        /* Never wait forever on a stalled request. */
        const REVEAL_HARD_TIMEOUT_MS = 25000;

        /* Network fetch and transcode have different cost profiles. Four
           concurrent fetches is comfortable (browsers allow ~6/host and HTTP/2
           multiplexes). Transcode is CPU-bound and UASTC is not cheap, so weak
           devices get two. Four also matches KTX2Loader's default worker pool —
           going wider just queues behind it while holding more payloads in
           flight. */
                const TRANSCODE_BATCH = options.workerLimit || 4;

        const TILE_PX = 512;

        /* Preallocated scratch */
        const _target = new THREE.Vector3();
        const _push = new THREE.Vector3();
        const _scale = new THREE.Vector3();
        const _hitPoint = new THREE.Vector3();
        const raycasterMM = new THREE.Raycaster();
        const mouseMM = new THREE.Vector2(-999, -999);
        let isHovering = false, isPointerDown = false, holdFactor = 0;

        /* Pulse and mouse/touch both write camera.position and mouseMM as
           independent authors, which stuttered when both ran at once. Rather
           than arbitrate per frame, drag-rotate is switched off entirely
           while Pulse is live. */
        let defaultTouches = null;
        let defaultMouseButtons = null;
        let touchSuppressed = false;
        function applyTouchSuppression() {
            if (!controls) return;
            if (defaultTouches) {
                controls.touches = touchSuppressed
                    ? { ONE: null, TWO: null }
                    : Object.assign({}, defaultTouches);
            }
            if (defaultMouseButtons) {
                controls.mouseButtons = touchSuppressed
                    ? { LEFT: null, MIDDLE: null, RIGHT: null }
                    : Object.assign({}, defaultMouseButtons);
            }
        }

        function makeTileGeometry() {
            const corner = TILE * 0.08;
            const shape = new THREE.Shape();
            shape.moveTo(0, corner); shape.lineTo(0, TILE - corner); shape.quadraticCurveTo(0, TILE, corner, TILE);
            shape.lineTo(TILE - corner, TILE); shape.quadraticCurveTo(TILE, TILE, TILE, TILE - corner);
            shape.lineTo(TILE, corner); shape.quadraticCurveTo(TILE, 0, TILE - corner, 0);
            shape.lineTo(corner, 0); shape.quadraticCurveTo(0, 0, 0, corner);

            const geo = new THREE.ShapeGeometry(shape);
            const uv = geo.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TILE, uv.getY(i) / TILE);
            geo.center();
            return geo;
        }

        /* ---------- texture creation ---------- */
        function finishTexture(tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.LinearFilter;
            /* Textures are now prepared BEFORE the mind map's renderer exists, so
               fall back to scene 1's renderer for the capability read. Same
               device, same driver, same limit. */
            const capSrc = rendererMM || renderer;
            tex.anisotropy = Math.min(8, capSrc ? capSrc.capabilities.getMaxAnisotropy() : 1);
            tex.needsUpdate = true;
            return tex;
        }

        function makeBitmapTexture(source) {
            const tex = new THREE.Texture(source);
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            // The texture is reused across contexts; closing its source after
            // the first upload makes fallback tiles disappear on re-entry.
            return finishTexture(tex);
        }

        function downscaleViaCanvas(path, signal) {
            return new Promise((res, rej) => {
                const img = new Image();
                img.decoding = 'async';
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = c.height = TILE_PX;
                    const ctx = c.getContext('2d');
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, TILE_PX, TILE_PX);
                    res(makeBitmapTexture(c));
                };
                img.onerror = rej;
                if (signal) signal.addEventListener('abort', () => { img.src = ''; rej(new Error('aborted')); });
                img.src = path;
            });
        }

        async function loadBitmapTile(path, signal) {
            if (typeof createImageBitmap === 'function') {
                try {
                    const res = await fetch(path, { cache: 'force-cache', signal });
                    if (!res.ok) throw new Error(res.status);
                    const blob = await res.blob();
                    const bmp = await createImageBitmap(blob, {
                        resizeWidth: TILE_PX,
                        resizeHeight: TILE_PX,
                        resizeQuality: 'high'
                    });
                    return makeBitmapTexture(bmp);
                } catch (e) {
                    if (e && e.name === 'AbortError') throw e;
                }
            }
            return downscaleViaCanvas(path, signal);
        }

        async function loadTile(i, signal) {
            if (ktx2Loader && !ktx2Disabled) {
                try {
                    const tex = await ktx2Loader.loadAsync(ktx2Paths[i]);
                    if (signal.aborted) { tex.dispose(); throw new DOMException('Aborted', 'AbortError'); }
                    if (ktx2Hits === 0) console.info('[scene3] KTX2 active — compressed textures in use.');
                    ktx2Hits += 1;
                    return finishTexture(tex);
                } catch (e) {
                    if (signal.aborted) throw e;
                    /* .ktx2 not generated yet, or transcoding unavailable. Fall
                       back for this tile — and if the first few all fail, stop
                       trying so we don't fire 76 doomed requests. */
                    ktx2Errors += 1;
                    if (ktx2Errors >= 3 && ktx2Hits === 0 && !ktx2Disabled) {
                        ktx2Disabled = true;
                        console.warn('[scene3] KTX2 unavailable after 3 attempts — using image fallback for all tiles. Have the .ktx2 files been generated?');
                    }
                }
            }
            ktx2Misses += 1;
            return loadBitmapTile(imagePaths[i], signal);
        }

        /* ---------- globe construction ---------- */
        function buildGlobe() {
            globe = new THREE.Group();
            /* Whole-sphere flip: a single 180° roll keeps every tile upright
               without touching the Fibonacci placement. */
            globe.rotation.z = Math.PI;
            if (options.globeTilt) {
                globe.rotation.x = options.globeTilt.x;
                globe.rotation.y = options.globeTilt.y;
            }
            /* Hidden until every texture is uploaded. The user must never see
               placeholder tiles or images popping in one at a time. */
            globe.visible = false;
            globe.scale.setScalar(0.92);
            globe.updateMatrixWorld(true);
            scene.add(globe);

            tileGeo = makeTileGeometry();

            hitSphere = new THREE.Mesh(
                new THREE.SphereGeometry(GLOBE_RADIUS, 32, 32),
                new THREE.MeshBasicMaterial({ visible: false })
            );
            globe.add(hitSphere);

            tiles = [];
            for (let i = 0; i < N; i++) {
                const material = new THREE.MeshBasicMaterial({
                    map: null, color: 0xffffff,
                    side: THREE.DoubleSide, transparent: true,
                    /* Starts fully transparent; the reveal tween raises it. */
                    opacity: 0
                });
                const mesh = new THREE.Mesh(tileGeo, material);
                const phi = Math.acos(1 - 2 * (i + 0.5) / N);
                const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
                const x = GLOBE_RADIUS * Math.cos(theta) * Math.sin(phi);
                const y = GLOBE_RADIUS * Math.sin(theta) * Math.sin(phi);
                const z = GLOBE_RADIUS * Math.cos(phi);
                mesh.position.set(x, y, z);
                mesh.lookAt(0, 0, 0);
                globe.add(mesh);
                tiles.push({
                    mesh,
                    base: new THREE.Vector3(x, y, z),
                    dir: new THREE.Vector3(x, y, z).normalize(),
                    phase: (i % 3) * (Math.PI * 0.666)
                });
            }
        }

        /* ---------- reveal ----------------------------------------------------
           Loader -> fully prepared globe -> smooth reveal. Uploads happen while
           the globe is invisible, so spreading them over frames (which is what
           keeps the allocation from spiking) costs nothing visually. */
        function reveal(reason) {
            if (revealed || !mounted || !globe) return;
            revealed = true;
            clearTimeout(revealTimeout);
            revealTimeout = null;

            if (reason) console.warn(`[scene3] revealing early: ${reason}`);

            loadingEl.style.opacity = 0;
            loadingEl.setAttribute('aria-hidden', 'true');
            globe.visible = true;
            options.onReady?.();

            if (REDUCED_MOTION) {
                globe.scale.setScalar(1);
                tiles.forEach(t => { t.mesh.material.opacity = TILE_OPACITY; });
                return;
            }

            const proxy = { v: 0 };
            revealTween = gsap.to(proxy, {
                v: 1,
                duration: 0.9,
                ease: 'power3.out',
                onUpdate: () => {
                    if (!globe) return;
                    globe.scale.setScalar(0.92 + 0.08 * proxy.v);
                    const o = TILE_OPACITY * proxy.v;
                    for (let i = 0; i < tiles.length; i++) tiles[i].mesh.material.opacity = o;
                },
                onComplete: () => { revealTween = null; }
            });
        }

        /* Runs in the background from page load rather than waiting for mount()
           — transcoding doesn't need the mind map's own renderer, since
           KTX2Loader.detectSupport() only reads context capabilities that
           scene 1's renderer (already running) answers identically. mount()
           is left with nothing to do but upload. */

        /* Same courtesy gate Assets.backfill() uses: do not speculatively pull
           megabytes on a metered or very slow connection. */
        function allowPrewarm() {
            const c = navigator.connection;
            if (!c) return true;
            if (c.saveData) return false;
            return !/(^|-)2g$/.test(c.effectiveType || '');
        }

        function logSummary() {
            if (summaryLogged) return;
            summaryLogged = true;
            console.info(
                `[scene3] tiles: ${ktx2Hits} via KTX2, ${ktx2Misses} via image fallback, ` +
                `${failedTiles.size} failed (${N}${N < FULL_N ? ` of ${FULL_N}, selected subset` : ''})`
            );
        }

        /* A tile finished preparing. If the scene is already mounted it goes
           straight into the upload queue; otherwise it waits in `textures` until
           mount() drains everything at once. */
        function notePrepared(k, tex) {
            if (tex) textures[k] = tex;
            else failedTiles.add(k);
            preparedCount += 1;
            if (mounted) enqueueUpload(k);
            if (preparedCount >= N) logSummary();
        }

        async function ensureKtx2Loader() {
            if (ktx2Loader || !MINDMAP.useKTX2 || ktx2Disabled) return;
            /* Must settle first: resolvedTranscoderPath is only final once the
               self-hosted-vs-CDN probe has answered. */
            await transcoderReady;
            try {
                ktx2Loader = new KTX2Loader()
                    .setTranscoderPath(resolvedTranscoderPath)
                    .detectSupport(rendererMM || renderer);          // scene 1's renderer
                ktx2Loader.setWorkerLimit(TRANSCODE_BATCH);
            } catch (e) {
                console.warn('[scene3] KTX2Loader unavailable, using image fallback.', e);
                ktx2Loader = null;
            }
        }

        /* PHASE 1 — network only. Fills the HTTP cache in batches of NET_BATCH so
           phase 2 transcodes from disk instead of racing the network. Resolves
           when the last byte is in cache, which is what the boot sequence waits
           on before starting the lower-priority project backfill. */
        async function probeKtx2(signal) {
            if (!MINDMAP.useKTX2 || ktx2Disabled) return;
            try {
                const response = await fetch(ktx2Paths[0], { cache: 'force-cache', signal });
                if (!response.ok) ktx2Disabled = true;
            } catch (error) {
                if (signal.aborted) throw error;
                ktx2Disabled = true;
            }
        }

        function nextIdle() {
            // Explicit visits must progress even on a device with slow frames.
            return mounted ? new Promise(resolve => setTimeout(resolve, 0))
                : new Promise(resolve => Idle.run(resolve));
        }

        async function prepareTiles(signal) {
            await probeKtx2(signal);
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            await ensureKtx2Loader();
            for (let i = 0; i < N; i += TRANSCODE_BATCH) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                const batch = [];
                for (let k = i; k < Math.min(i + TRANSCODE_BATCH, N); k++) {
                    if (textures[k] || failedTiles.has(k)) continue;
                    batch.push(loadTile(k, signal).then(tex => {
                        if (signal.aborted) {
                            tex.image?.close?.();
                            tex.dispose();
                            return;
                        }
                        notePrepared(k, tex);
                    }).catch(error => {
                        if (!signal.aborted) notePrepared(k, null);
                    }));
                }
                await Promise.all(batch);
                await nextIdle();
            }
        }

        const preparation = createPreparation({
            allowed: allowPrewarm,
            prepare: prepareTiles,
            onError: error => console.warn('[scene3] preparation interrupted', error),
        });
        const prewarm = preparation.start;

        /* FIX 5 — incremental GPU upload.
           Previously all 76 textures were uploaded and mipmapped inside the FIRST
           frame of scene 3: one enormous frame plus a single ~106MB allocation
           request at the worst possible moment. Now at most UPLOADS_PER_FRAME are
           pushed to the GPU per frame via initTexture(), spreading the cost and
           the allocation over ~20 frames. */
        const UPLOADS_PER_FRAME = 4;

        function enqueueUpload(k) {
            if (!mounted) return;
            if (failedTiles.has(k)) { uploadedCount += 1; maybeReveal(); return; }
            if (textures[k]) uploadQueue.push(k);
        }

        function maybeReveal() {
            if (uploadedCount < N) return;
            if (options.strictReady && failedTiles.size) {
                options.onError?.(new Error('Some Mind Map images could not be prepared.'));
                return;
            }
            reveal();
        }

        function pumpUploads() {
            if (!rendererMM || !uploadQueue.length) return;
            let budget = UPLOADS_PER_FRAME;
            while (budget-- > 0 && uploadQueue.length) {
                const k = uploadQueue.shift();
                const tex = textures[k];
                if (!tex) { failedTiles.add(k); uploadedCount += 1; continue; }
                try { rendererMM.initTexture(tex); } catch (e) { /* non-fatal */ }
                const t = tiles[k];
                if (t) {
                    t.mesh.material.map = tex;
                    t.mesh.material.needsUpdate = true;
                }
                uploadedCount += 1;
            }
            /* Everything accounted for (uploaded or failed) — show the globe. */
            maybeReveal();
        }

        /* ---------- layout ---------- */
        function layout() {
            camera.aspect = V.aspect;
            camera.updateProjectionMatrix();
            if (rendererMM) {
                rendererMM.setPixelRatio(Governor.ratioFor());
                rendererMM.setSize(V.width, V.height, false);
                rendererMM.domElement.style.width = '100%';
                rendererMM.domElement.style.height = '100%';
            }

            const extent = 4.33;
            const halfTan = Math.tan(MM_FOV * Math.PI / 360);
            const shapeFactor = options.fitRadius ? Math.min(V.aspect, 1) : Math.pow(Math.min(V.aspect, 1), 0.375);
            const minD = controls ? controls.minDistance : 4;
            const maxD = controls ? controls.maxDistance : 20;
            const z = clamp((options.fitRadius || extent) / (halfTan * shapeFactor), minD, maxD);
            camera.position.set(0, 0, z);
            options.frameCamera?.(camera, V);
            if (controls) controls.update();
        }

        /* ---------- mount / unmount ---------- */
        function mount() {
            if (mounted) return;
            mounted = true;

            loadingEl.style.opacity = 1;
            loadingEl.setAttribute('aria-hidden', 'false');
            uploadedCount = 0;
            revealed = false;
            uploadQueue = [];

            rendererMM = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: options.powerPreference || 'high-performance' });
            rendererMM.setSize(V.width, V.height, false);
            rendererMM.domElement.style.width = '100%';
            rendererMM.domElement.style.height = '100%';
            container3.appendChild(rendererMM.domElement);
            Governor.register('scene3', 3, (r) => rendererMM && rendererMM.setPixelRatio(r));
            glGuard = guardContext(rendererMM, 'scene3', 3, () => {
                textures.forEach(t => { if (t) t.needsUpdate = true; });
            });

            controls = new OrbitControls(camera, rendererMM.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.enablePan = false;
            controls.minDistance = 4;
            controls.maxDistance = 20;
            if (options.lockPolar) {
                controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 2;
            }
            /* Captured so both touch- and mouse-drag-rotate can be switched
               off and restored exactly while Pulse is live. */
            defaultTouches = Object.assign({}, controls.touches);
            defaultMouseButtons = Object.assign({}, controls.mouseButtons);
            applyTouchSuppression();

            buildGlobe();
            layout();
            unsubViewport = V.onChange(layout);

            /* Make sure preparation is running (it normally started seconds ago
               from the boot sequence; this covers a direct fast click, or a
               connection where prewarm was skipped). */
            prewarm({ force: true });

            /* Drain whatever is already prepared. On a normal visit this is all
               of it, so entering costs only the incremental upload. Anything
               still in flight arrives via notePrepared() -> enqueueUpload(). */
            for (let k = 0; k < N; k++) {
                if (textures[k] || failedTiles.has(k)) enqueueUpload(k);
            }

            /* If a handful of requests stall, reveal what we have rather than
               leaving the user on a loader forever. */
            revealTimeout = setTimeout(() => {
                if (!revealed) {
                    if (options.strictReady) options.onError?.(new Error('Mind Map preparation timed out.'));
                    else reveal(`timeout, ${uploadedCount}/${N} ready`);
                }
            }, REVEAL_HARD_TIMEOUT_MS);
        }

        function unmount() {
            if (!mounted) return;
            mounted = false;

            /* Tell the context guard this teardown is intentional BEFORE anything
               can fire webglcontextlost. Without this, the deliberate
               loseContext() below raised the "graphics stopped responding"
               overlay five seconds later, over whatever scene the user had
               navigated to by then. */
            if (glGuard) { glGuard.markDisposing(); }

            clearTimeout(revealTimeout);
            revealTimeout = null;
            if (revealTween) { revealTween.kill(); revealTween = null; }
            revealed = false;

            if (unsubViewport) { unsubViewport(); unsubViewport = null; }
            Governor.unregister('scene3');

            if (controls) { controls.dispose(); controls = null; }

            /* Textures and the KTX2 loader deliberately SURVIVE unmount. The GPU
               copies go away with the context below, but the transcoded data
               stays in memory, so re-entering re-uploads from RAM instead of
               re-downloading and re-transcoding. tiles/materials/geometry are
               rebuilt on the next mount. */
            tiles.forEach(t => t.mesh.material.dispose());
            if (hitSphere) { hitSphere.geometry.dispose(); hitSphere.material.dispose(); }
            if (tileGeo) { tileGeo.dispose(); tileGeo = null; }
            if (globe) { scene.remove(globe); globe = null; }
            tiles = [];
            uploadQueue = [];
            uploadedCount = 0;
            hitSphere = null;

            if (rendererMM) {
                if (rendererMM.domElement.parentNode) {
                    rendererMM.domElement.parentNode.removeChild(rendererMM.domElement);
                }
                /* Remove the listeners entirely, then grab the context BEFORE
                   dispose(), then drop it explicitly so the driver reclaims the
                   framebuffer immediately rather than at GC time. */
                if (glGuard) { glGuard.destroy(); glGuard = null; }
                let lose = null;
                try { lose = rendererMM.getContext().getExtension('WEBGL_lose_context'); } catch (e) {}
                rendererMM.dispose();
                if (lose) lose.loseContext();
                rendererMM = null;
            }
            glGuard = null;

            /* Reset per-mount interaction state. Preparation flags are NOT reset:
               prewarmStarted and the prepared textures persist for the session. */
            isHovering = false;
            isPointerDown = false;
            holdFactor = 0;
            mouseMM.set(-999, -999);
        }


        /* ---------- frame ---------- */
        function frame(dt, time) {
            if (!mounted || !rendererMM) return;

            pumpUploads();
            controls.update();

            /* Nothing interactive until the globe is actually on screen. */
            if (!revealed) {
                rendererMM.render(scene, camera);
                return;
            }

            /* targetHold accepts a boolean (mouse/touch, 1/0 as before) or a float
               0..1 (Pulse, partway into the range). The lerp-rate ternary
               below works for both — any truthy value uses the fast rate. */
            const step = options.frameIndependent ? clamp(dt * 60, 0, 3) : 1;
            const rate = value => options.frameIndependent ? 1 - Math.pow(1 - value, step) : value;
            const targetHold = typeof isPointerDown === 'number' ? isPointerDown : (isPointerDown ? 1 : 0);
            holdFactor += (targetHold - holdFactor) * rate(isPointerDown ? 0.25 : 0.035);

            if (hitSphere) {
                raycasterMM.setFromCamera(mouseMM, camera);
                const hits = raycasterMM.intersectObject(hitSphere);
                if (hits.length) {
                    /* hits[0].point is world space; t.base/t.dir are local. The
                       globe carries a 180° roll, so the hit must be converted or
                       the push lands on the opposite side of the sphere. */
                    _hitPoint.copy(hits[0].point);
                    globe.worldToLocal(_hitPoint);
                    isHovering = true;
                } else {
                    isHovering = false;
                }
            }

            const protrusion = mix(1.45, 1.0, V.t);

            /* One value for the whole mass this frame — see MASS BREATHING
               ENVELOPE above. Hoisted out of the tile loop deliberately: it is
               a property of the composition, not of any tile. */
            const breath = 0.5 + 0.5 * Math.sin(time * BREATH_RATE);
            const swell  = 0.5 + 0.5 * Math.sin(time * SWELL_RATE);
            const massBreath = MASS_BREATH_MIN +
                (MASS_BREATH_MAX - MASS_BREATH_MIN) * (breath * (0.45 + 0.55 * swell));

            for (let i = 0; i < tiles.length; i++) {
                const t = tiles[i];
                let scaleTarget = 1.0;
                let pushed = false;

                /* Per-tile breathing, unchanged — the individual rhythm the
                   globe already had. massBreath then scales the result, so the
                   mass expands and contracts as one body underneath it. Same
                   single multiplyScalar as before: no extra per-tile work. */
                const idlePulse = options.quietReduced && REDUCED_MOTION ? 0 : (Math.sin(time * 1.2 + t.phase) + 1) * 0.5;
                _target.copy(t.base).multiplyScalar((1 + idlePulse * 0.10) * (options.quietReduced && REDUCED_MOTION ? 1 : massBreath));

                if (isHovering) {
                    const distance = _hitPoint.distanceTo(t.base);
                    const effectRadius = (EFFECT_RADIUS_BASE + holdFactor * EFFECT_RADIUS_HOLD) * (options.effectRadiusScale || 1);
                    /* Coefficients trimmed to 0.9373 of the original travel (both terms
                       move together so scaling holds at every holdFactor, not
                       just full extension). The ONE place push distance is
                       computed, so it reaches press-and-hold and Pulse
                       identically — `protrusion` carries the viewport
                       adaptation, not this. */
                    const maxPush = (1.2935 + holdFactor * 2.9994) * protrusion * (options.pushScale || 1);

                    if (distance < effectRadius) {
                        pushed = true;
                        const force = Math.pow(1 - distance / effectRadius, 2);
                        _push.copy(t.dir).multiplyScalar(force * maxPush);
                        _target.add(_push);

                        const sway = 0.112 * force * (options.swayScale || 1);
                        _target.x += Math.sin(time * 1.5 + t.phase) * sway;
                        _target.y += Math.cos(time * 1.2 + t.phase) * sway;
                        _target.z += Math.sin(time * 1.8 + t.phase) * sway;

                        /* Hold term 0.20 -> 0.245: a fully extended tile now
                           reads a little more substantial as it comes forward,
                           while the untouched 1.05 base leaves a light hover
                           exactly as it was. */
                        const maxScale = 1.05 + holdFactor * 0.245;
                        scaleTarget = 1 + force * (maxScale - 1);
                    }
                }

                /* ---- APPROACH CURVE ----
                   Rate is now a function of remaining distance rather than
                   the old flat 0.28 lerp, which tapered uniformly regardless
                   of travel distance: pulled harder far from target, more
                   gently in the final stretch. Endpoints, sway and release
                   decay unchanged. distanceToSquared avoids a sqrt per tile
                   per frame (monotonic is enough); the clamp bounds the rate
                   so it can't overshoot on a large jump. */
                let lerpSpeed = 0.04;
                if (pushed) {
                    const remaining = t.mesh.position.distanceToSquared(_target);
                    lerpSpeed = 0.19 + 0.26 * clamp(remaining * 0.55, 0, 1);
                }
                t.mesh.position.lerp(_target, rate(lerpSpeed));
                _scale.set(scaleTarget, scaleTarget, scaleTarget);
                t.mesh.scale.lerp(_scale, rate(lerpSpeed));
            }

            rendererMM.render(scene, camera);
        }

        /* PULSE EDGE ROTATION: OrbitControls recomputes its spherical from
           camera.position at the start of every update(), so nudging position
           here and letting update() run is indistinguishable from a drag —
           same damping/clamps. No internals touched; just a second caller
           alongside mouse/touch. */
        function nudgeRotation(dAzimuth, dPolar) {
            if (!mounted || !controls) return;
            const offset = camera.position.clone();
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta += dAzimuth;
            spherical.phi = options.lockPolar ? Math.PI / 2 : clamp(spherical.phi + dPolar, 0.35, Math.PI - 0.35);
            spherical.makeSafe();
            offset.setFromSpherical(spherical);
            camera.position.copy(offset);
            camera.lookAt(0, 0, 0);
        }

        Loop.register(3, frame);

        return {
            mount,
            unmount,
            dispose() {
                preparation.cancel();
                unmount();
                textures.forEach(texture => {
                    if (!texture) return;
                    texture.image?.close?.();
                    texture.dispose();
                });
                ktx2Loader?.dispose();
            },
            prewarm,
            pausePreparation: preparation.cancel,
            /* The scene-1 intent signal (folder centred/hovered) still calls this;
               it is now just an early nudge for the same background pipeline. */
            prefetch: prewarm,
            get mounted() { return mounted; },
            get tileCount() { return N; },
            setPointer(x, y) {
                if (!mounted) return;
                mouseMM.x = (x / V.width) * 2 - 1;
                mouseMM.y = -(y / V.height) * 2 + 1;
            },
            setPointerDown(v) { if (mounted) isPointerDown = v; },
            clearPointer() { isPointerDown = false; mouseMM.set(-999, -999); },
            nudgeRotation,
            /* Independent of mouseMM (which Pulse continuously overwrites to
               screen-centre while live) — tests whether a given screen point
               actually lands on the globe. Only ever called on a discrete
               click, not per-frame, so a fresh Raycaster/Vector2 each call
               costs nothing. */
            hitsSphere(x, y) {
                if (!mounted || !revealed || !hitSphere) return false;
                const nx = (x / V.width) * 2 - 1;
                const ny = -(y / V.height) * 2 + 1;
                const rc = new THREE.Raycaster();
                rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
                return rc.intersectObject(hitSphere).length > 0;
            },
            /* Pulse calls this on enable/disable. Idempotent and safe before
               mount — mount() re-applies whatever the current state is. */
            setTouchSuppressed(v) {
                touchSuppressed = !!v;
                applyTouchSuppression();
            },
            get touchSuppressed() { return touchSuppressed; }
        };
    })();
    return Scene3;
}

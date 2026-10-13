
export function createCarousel({ PROJECTS, CARDS, PROJECT_START, PROFILE_TAB, Tab, Ticker, NO_ROUND, basename, derivedURL, REDUCED, clamp }) {
    const Carousel = (() => {
        const el = document.getElementById('carousel');
        const nameEl = document.getElementById('project-name');
        const metaEl = document.getElementById('meta');
        const collectionEl = document.getElementById('collection');
        const descEl = document.getElementById('description');
        const dotsEl = document.getElementById('position-dots');
        /* Needed to tell whether this carousel's own panel is the live
           section — it is only a scroll container in that state (see the
           #carousel overflow rule in the CSS). */
        const homeEl = document.getElementById('home');

        const slides = [], frames = [], imgs = [];
        const natural = [];   // cached {w,h} per card, filled once its image loads
        let frameW = 0, frameH = 0;
        let slideW = 1;
        let active = -1;
        let activeProject = -1;
        let tweening = false;
        let metaTimer = null;
        let metaTimer2 = null;
        let nameTimer = null;
        let revealed = false;

        CARDS.forEach((c, i) => {
            const slide = document.createElement('div');
            slide.className = 'slide';
            const frame = document.createElement('div');
            frame.className = 'frame';
            const img = document.createElement('img');
            img.decoding = 'async';
            img.alt = c.desc || PROJECTS[c.project].name;
            if (NO_ROUND.has(basename(c.src))) img.classList.add('no-round');
            img.addEventListener('load', function () {
                natural[i] = { w: this.naturalWidth, h: this.naturalHeight };
                sizeImage(i);
                this.classList.add('in');
            });
            img.addEventListener('error', function () {
                if (this.dataset.fell === '1') return;
                this.dataset.fell = '1';
                this.src = c.src;
            });
            frame.appendChild(img);
            slide.appendChild(frame);
            el.appendChild(slide);
            slides.push(slide); frames.push(frame); imgs.push(img);
        });

        /* Sizes an image to exactly match its own rendered content within the
           fixed frame — this is what makes the corner radius actually visible
           while the frame itself never changes size. */
        function sizeImage(i) {
            const n = natural[i];
            if (!n || !n.w || !n.h || !frameW || !frameH) return;
            const ar = n.w / n.h;
            let w = frameW, h = w / ar;
            if (h > frameH) { h = frameH; w = h * ar; }
            /* Skips the write when unchanged — an identical value still dirties
               the element as a style mutation, and layout() runs from
               enterSection() on the same frame the nav morph begins, so this
               was avoidable invalidation landing exactly where it'd show. */
            const ws = Math.round(w) + 'px', hs = Math.round(h) + 'px';
            const st = imgs[i].style;
            if (st.width === ws && st.height === hs) return;
            st.width = ws; st.height = hs;
        }

        function loadAll() {
            /* frameW is set by layout(), which always runs before this — using
               the real measured width means this stays correct in both
               orientations instead of assuming a portrait-width viewport. */
            const displayW = frameW || window.innerWidth * 0.86;
            imgs.forEach((img, i) => {
                const url = derivedURL(CARDS[i].src, displayW);
                if (i < 3 && 'fetchPriority' in img) img.fetchPriority = 'high';
                img.src = url;
                if (i < 3 && img.decode) img.decode().catch(() => {});
            });
        }

        function paint() {
            /* no-op — flat single-image carousel, nothing to update per-frame.
               The `scrolling` flag, `tick` subscriber, Ticker registration
               and idle timer that used to drive this at 60fps were removed
               entirely (paint() does nothing, so every swipe and jump-tween
               frame was starting a rAF subscriber to call an empty
               function). Kept as a documented seam for future per-frame work. */
        }

        function onScroll() {
            /* The element stops being a scroll container whenever the
               projects section isn't the active one, and the browser resets
               scrollLeft to 0 when that happens. That synthetic event must
               not be read as the user having swiped back to the first card —
               it would silently rewrite `active`, the tab and the meta block. */
            if (homeEl.dataset.section !== 'projects') return;
            if (!tweening) setActive(Math.round(el.scrollLeft / slideW));
        }

        function setActive(i) {
            i = clamp(i, 0, CARDS.length - 1);
            if (i === active) return;
            active = i;
            const c = CARDS[i];
            if (c.project !== activeProject) {
                activeProject = c.project;
                if (revealed) { Tab.setActive(activeProject, false); setName(PROJECTS[activeProject].name, false); }
            }
            if (revealed) setMeta(c.collection, c.desc, c.posInCollection, c.collectionCount);
        }

        function reveal() {
            if (revealed) return;
            revealed = true;
            const c = CARDS[active];
            /* The page opens on Profile, not on a project — so seed the tab
               there rather than at the carousel's own starting card. The
               carousel below still primes its meta/name state, so it's fully
               ready the instant a project icon is tapped. */
            Tab.setActive(PROFILE_TAB, true);
            setName(PROJECTS[activeProject].name, true);
            collectionEl.textContent = c.collection;
            descEl.textContent = c.desc;
            renderDots(c.collectionCount, c.posInCollection);
            metaEl.classList.add('ready');
        }

        function setName(text, instant) {
            if (instant) { nameEl.textContent = text; nameEl.style.opacity = 1; return; }
            clearTimeout(nameTimer);
            nameEl.classList.add('swap');
            nameTimer = setTimeout(() => { nameEl.textContent = text; nameEl.classList.remove('swap'); }, 170);
        }

        let dotCount = -1;
        function renderDots(total, activeIdx) {
            if (total !== dotCount) {
                dotCount = total;
                dotsEl.innerHTML = '';
                for (let i = 0; i < total; i++) {
                    const d = document.createElement('span');
                    d.className = 'dot';
                    dotsEl.appendChild(d);
                }
            }
            [...dotsEl.children].forEach((d, i) => d.classList.toggle('active', i === activeIdx));
        }

        function setMeta(collection, desc, posInCollection, collectionCount) {
            clearTimeout(metaTimer);
            clearTimeout(metaTimer2);
            collectionEl.classList.add('swap');
            descEl.classList.add('swap');
            metaTimer = setTimeout(() => {
                collectionEl.textContent = collection;
                renderDots(collectionCount, posInCollection);
                collectionEl.classList.remove('swap');
            }, 150);
            metaTimer2 = setTimeout(() => {
                descEl.textContent = desc;
                descEl.classList.remove('swap');
            }, 150 + 70);
        }

        const JUMP_MS = 340;
        let runGen = 0;   /* bumped on every jumpTo() call; a stale run() sees a
                             mismatch and stops itself instead of fighting the
                             newest tween over scrollLeft. */
        function jumpTo(index, instant) {
            const target = clamp(index, 0, CARDS.length - 1) * slideW;
            const from = el.scrollLeft;
            const delta = target - from;
            if (Math.abs(delta) < 1) return;

            el.classList.add('tweening');
            tweening = true;

            const c = CARDS[clamp(index, 0, CARDS.length - 1)];
            active = clamp(index, 0, CARDS.length - 1);
            if (c.project !== activeProject) { activeProject = c.project; setName(PROJECTS[activeProject].name, false); }
            setMeta(c.collection, c.desc, c.posInCollection, c.collectionCount);

            /* `instant` is used when the carousel is not on screen yet (the
               Projects button pressing through from Profile) — same end
               state, no tween nobody can see. */
            if (REDUCED || instant) { el.scrollLeft = target; el.classList.remove('tweening'); tweening = false; paint(); return; }

            const gen = ++runGen;
            const t0 = performance.now();
            Ticker.add(function run() {
                if (gen !== runGen) return false;
                const p = clamp((performance.now() - t0) / JUMP_MS, 0, 1);
                const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
                el.scrollLeft = from + delta * e;
                paint();
                if (p < 1) return true;
                el.classList.remove('tweening');
                tweening = false;
                return false;
            });
        }
        function jumpToProject(pi, instant) { Tab.setActive(pi, false); jumpTo(PROJECT_START[pi], instant); }

        /* Viewport width the last full measurement was taken against, so
           enterSection() can tell a genuinely stale layout from a fresh one. */
        let measuredW = -1;

        function layout() {
            measuredW = window.innerWidth;
            slideW = slides[0].getBoundingClientRect().width;
            const fr = frames[0].getBoundingClientRect();
            frameW = fr.width; frameH = fr.height;
            natural.forEach((n, i) => { if (n) sizeImage(i); });
            paint();
        }

        el.addEventListener('scroll', onScroll, { passive: true });

        /* Starts on the SECOND image of the first project rather than the
           first — landing straight on a state where the carousel already reads
           as mid-sequence rather than a single static image. */
        const START_INDEX = 1;

        function start() {
            layout();
            loadAll();
            el.scrollLeft = START_INDEX * slideW;
            setActive(START_INDEX);
            el.classList.add('ready');
            paint();
        }

        /* Called the moment projects becomes the active section. scrollLeft
           can't survive a period of not being a scroller, so the active
           card's offset is re-applied here, synchronously, so a jumpTo() on
           the same tap reads the correct starting position. */
        function enterSection() {
            /* Re-measures only if the viewport width actually changed (or slideW is
               unusable) — layout() forces a synchronous style+layout flush,
               and calling it unconditionally landed that cost on the very
               first frame of the nav morph/cross-fade transition, since
               relayout() already re-measures on every real viewport change
               anyway. Re-applying scrollLeft below stays unconditional. */
            if (measuredW !== window.innerWidth || !(slideW > 1)) layout();
            const i = active < 0 ? START_INDEX : active;
            el.scrollLeft = i * slideW;
            paint();
        }

        return { start, layout, enterSection, jumpTo, jumpToProject, reveal };
    })();
    return Carousel;
}

import { createProjectTransition } from './project-transition.js';

export function createCarousel({ PROJECTS, CARDS, PROJECT_START, PROFILE_TAB, Tab, NO_ROUND, basename, derivedURL, REDUCED, clamp }) {
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
        let settleTimer = null;
        let pointerHeld = false;
        let touchHeld = false;
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

        const SWITCH_MS = 180;
        homeEl.style.setProperty('--project-change-duration', SWITCH_MS + 'ms');
        const visible = () => homeEl.classList.contains('active') && homeEl.dataset.section === 'projects';

        function syncCard(index, instant = true, select = visible()) {
            index = clamp(index, 0, CARDS.length - 1);
            active = index;
            const card = CARDS[index];
            activeProject = card.project;
            if (!revealed && !select) return;
            // Caption, dots and selection refer to one committed image.
            nameEl.textContent = PROJECTS[card.project].name;
            collectionEl.textContent = card.collection;
            descEl.textContent = card.desc;
            renderDots(card.collectionCount, card.posInCollection);
            Tab.setActive(card.project, instant);
        }

        async function prepareImage(index) {
            const image = imgs[index];
            // All images are still requested eagerly. A project change waits
            // for its existing request instead of revealing an empty card.
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    if (image.decode) await image.decode();
                    else if (!image.complete) await new Promise((resolve, reject) => {
                        image.addEventListener('load', resolve, { once: true });
                        image.addEventListener('error', reject, { once: true });
                    });
                    if (image.naturalWidth) return;
                } catch { /* The existing error handler can retry the original source. */ }
            }
            throw new Error('Project image could not be loaded');
        }

        const transition = createProjectTransition({
            duration: SWITCH_MS,
            prepare: prepareImage,
            hide() {
                homeEl.classList.remove('project-direct');
                homeEl.classList.add('project-switching', 'project-hiding');
                el.classList.add('tweening');
            },
            commit(index, instant) {
                syncCard(index, instant, true);
                // Change position only while hidden; no intermediate projects fly by.
                el.scrollLeft = index * slideW;
                if (!revealed) reveal();
            },
            reveal() { homeEl.classList.remove('project-hiding'); },
            restore() {
                homeEl.classList.add('project-direct');
                homeEl.classList.remove('project-switching', 'project-hiding');
                el.classList.remove('tweening');
            },
            onError: error => console.warn('[mobile carousel]', error.message),
        });

        function commitSettled() {
            clearTimeout(settleTimer);
            if (!visible() || transition.busy || pointerHeld || touchHeld) return;
            const index = clamp(Math.round(el.scrollLeft / slideW), 0, CARDS.length - 1);
            if (index !== active) syncCard(index, true);
        }

        function scheduleSettle() {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(commitSettled, 120);
        }

        function onScroll() {
            if (!visible() || transition.busy) return;
            // No halfway caption changes while the browser is still swiping/snapping.
            scheduleSettle();
        }

        function interrupt({ sync = true } = {}) {
            transition.cancel();
            clearTimeout(settleTimer);
            if (sync && visible()) syncCard(Math.round(el.scrollLeft / slideW), true);
        }

        function reveal() {
            if (revealed) return;
            revealed = true;
            const c = CARDS[active];
            /* The page opens on Profile, not on a project — so seed the tab
               there rather than at the carousel's own starting card. The
               carousel below still primes its meta/name state, so it's fully
               ready the instant a project icon is tapped. */
            if (homeEl.dataset.section !== 'mindmap') Tab.setActive(homeEl.dataset.section === 'projects' ? activeProject : PROFILE_TAB, true);
            nameEl.textContent = PROJECTS[activeProject].name;
            nameEl.classList.add('ready');
            collectionEl.textContent = c.collection;
            descEl.textContent = c.desc;
            renderDots(c.collectionCount, c.posInCollection);
            metaEl.classList.add('ready');
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

        function jumpTo(index, instant = false) {
            clearTimeout(settleTimer);
            index = clamp(index, 0, CARDS.length - 1);
            const hidden = !visible();
            if (!hidden && index === active && Math.abs(el.scrollLeft - index * slideW) < 1) {
                interrupt();
                return;
            }
            return transition.request(index, { instant: REDUCED || instant || hidden });
        }
        function jumpToProject(project, instant) {
            return jumpTo(PROJECT_START[project], instant);
        }

        /* Viewport width the last full measurement was taken against, so
           enterSection() can tell a genuinely stale layout from a fresh one. */
        let measuredW = -1;

        function layout() {
            measuredW = window.innerWidth;
            slideW = slides[0].getBoundingClientRect().width;
            const fr = frames[0].getBoundingClientRect();
            frameW = fr.width; frameH = fr.height;
            natural.forEach((n, i) => { if (n) sizeImage(i); });
        }

        el.addEventListener('scroll', onScroll, { passive: true });
        el.addEventListener('scrollend', commitSettled, { passive: true });
        el.addEventListener('pointerdown', () => { pointerHeld = true; interrupt(); }, { passive: true });
        el.addEventListener('pointercancel', () => { pointerHeld = false; scheduleSettle(); }, { passive: true });
        window.addEventListener('pointerup', () => {
            if (!pointerHeld) return;
            pointerHeld = false;
            scheduleSettle();
        }, { passive: true });
        el.addEventListener('touchstart', () => { touchHeld = true; interrupt(); }, { passive: true });
        const endTouch = () => { touchHeld = false; scheduleSettle(); };
        el.addEventListener('touchend', endTouch, { passive: true });
        el.addEventListener('touchcancel', endTouch, { passive: true });
        el.addEventListener('wheel', () => interrupt({ sync: false }), { passive: true });
        el.addEventListener('keydown', () => interrupt());
        document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt({ sync: false }); });

        /* Starts on the SECOND image of the first project rather than the
           first — landing straight on a state where the carousel already reads
           as mid-sequence rather than a single static image. */
        const START_INDEX = 1;

        function start() {
            layout();
            loadAll();
            el.scrollLeft = START_INDEX * slideW;
            syncCard(START_INDEX);
            el.classList.add('ready');
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
        }

        return { start, layout, enterSection, jumpTo, jumpToProject, reveal, interrupt };
    })();
    return Carousel;
}

import { createMindMapUI } from './mind-map-ui.js';
import { createGallery } from './gallery.js';
import { createCarousel } from './carousel.js';
import { PROJECTS, CARDS, PROJECT_START, PROFILE_TAB, VIDEOS, ICONS } from './project-data.js';
import { imageUrl } from '../shared/media.js';
import { copyWithFeedback } from '../shared/clipboard.js';
import { PROFILE_PHOTOS, PROFILE_LINKS } from '../shared/profile.js';

export function initMobile() {
    /* ==========================================================================
       MOBILE EXPERIENCE — pure ES module, no three.js/GSAP import.
       ========================================================================== */

    const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const derivedURL = (src, cssWidth) => imageUrl(src, cssWidth, DPR);

    /* ==========================================================================
       ROOT + ROUTER
       ========================================================================== */
    const root = document.getElementById('mobile-root');
    const pages = { home: document.getElementById('home'), gallery: document.getElementById('gallery') };
    const switcher = document.getElementById('switcher');
    const switchThumb = document.getElementById('switch-thumb');
    const switchBtns = [...switcher.querySelectorAll('.switch-btn')];
    const backBtn = document.getElementById('back-btn');

    /* Landscape is its own composition for Home (see the LANDSCAPE CSS
       section); the gallery carousel's motion math reads the viewport
       directly every frame and adapts on its own. Read synchronously at boot
       so the very first layout pass already has it. */
    function currentOrient() { return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'; }
    root.dataset.orient = currentOrient();

    /* ==========================================================================
       VIEWPORT UNITS (mobile) — CORE RULE: never size against raw `vh`
       (excludes the URL bar, overstating available space). --mvh/--mvw come
       from visualViewport, rewritten on every resize; --app-mh/--panel-h
       derive from those and drive everything that must fit the screen.
       ========================================================================== */
    /* ---- PINCH-ZOOM GUARD ----
       visualViewport reports the ZOOMED viewport, and the whole mobile
       layout derives from --mvh/--mvw — ungated, a pinch rewrote the entire
       layout at zoomed scale and stayed wrong on zoom-out. Global (not
       Gallery-specific); backstops the BOOT gesture-listeners, since iOS
       Safari has ignored user-scalable/maximum-scale since iOS 10. */
    function isZoomed() {
        const vv = window.visualViewport;
        return !!vv && typeof vv.scale === 'number' && vv.scale > 1.01;
    }

    function writeViewportUnits() {
        /* Hold the last known-good units while zoomed. A resize fires again
           on the way back to scale 1, which reinstates them. */
        if (isZoomed()) return;
        const vv = window.visualViewport;
        const w = Math.round(vv ? vv.width : window.innerWidth);
        const h = Math.round(vv ? vv.height : window.innerHeight);
        /* Written to :root, NOT to #mobile-root. --app-mh/--panel-h are
           declared in the :root block, and a custom property is substituted
           using the value in scope at the element where it's DECLARED — so
           overriding --mvh further down the tree would never reach them. */
        document.documentElement.style.setProperty('--mvh', (h / 100) + 'px');
        document.documentElement.style.setProperty('--mvw', (w / 100) + 'px');
    }
    writeViewportUnits();

    let currentPage = 'home';

    function moveThumb(instant) {
        const btn = switchBtns.find(b => b.dataset.page === currentPage);
        if (!btn) return;
        if (instant) switchThumb.style.transition = 'none';
        switchThumb.style.width = btn.offsetWidth + 'px';
        switchThumb.style.transform = `translateX(${btn.offsetLeft - 3}px)`;
        if (instant) requestAnimationFrame(() => { switchThumb.style.transition = ''; });
    }

    function goto(page) {
        if (page === currentPage) return;
        Carousel.interrupt({ sync: false });
        currentPage = page;
        root.dataset.page = page;
        switchBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.page === page)));
        Object.entries(pages).forEach(([k, el]) => el.classList.toggle('active', k === page));
        moveThumb(false);
        Contact.close();

        if (page === 'gallery') {
            MindMap.leave();
            pages.home.classList.remove('arrive');
            Gallery.enter();
        } else {
            Gallery.leave();
            if (pages.home.dataset.section === 'mindmap') MindMap.enter();
            MindMap.discover();
            /* Restart the staggered arrival every time we come back. */
            pages.home.classList.remove('arrive');
            void pages.home.offsetWidth;
            pages.home.classList.add('arrive');
        }
    }

    /* ---- draggable switcher ----
       The thumb can be grabbed and slid across, not just tapped. Nearest slot on
       release wins, and a drag suppresses the click that would otherwise follow. */
    let sDrag = false, sMoved = false, sStartX = 0, sBaseX = 0;

    const thumbX = () => {
        const m = /translateX\(([-\d.]+)px\)/.exec(switchThumb.style.transform);
        return m ? parseFloat(m[1]) : 0;
    };
    const slotX = (i) => switchBtns[i].offsetLeft - 3;

    switcher.addEventListener('pointerdown', (e) => {
        sDrag = true;
        sMoved = false;
        sStartX = e.clientX;
        sBaseX = thumbX();
        switchThumb.style.transition = 'none';
        /* Capture deferred to pointermove, same reason as the tab bar: capturing
           on pointerdown makes `switcher` the click target and can swallow a
           plain tap's click. This switcher self-healed the lockup half
           (sMoved resets every pointerdown) but had the same swallowed-tap risk. */
    }, { passive: true });

    switcher.addEventListener('pointermove', (e) => {
        if (!sDrag) return;
        const dx = e.clientX - sStartX;
        if (Math.abs(dx) > 4 && !sMoved) {
            sMoved = true;
            try { switcher.setPointerCapture(e.pointerId); } catch (err) {}
        }
        switchThumb.style.transform =
            `translateX(${clamp(sBaseX + dx, slotX(0), slotX(1))}px)`;
    }, { passive: true });

    function endSwitchDrag() {
        if (!sDrag) return;
        sDrag = false;
        switchThumb.style.transition = '';
        if (!sMoved) { moveThumb(false); return; }
        const mid = (slotX(0) + slotX(1)) / 2;
        const target = thumbX() > mid ? 'gallery' : 'home';
        if (target === currentPage) moveThumb(false);
        else goto(target);
    }
    switcher.addEventListener('pointerup', endSwitchDrag, { passive: true });
    switcher.addEventListener('pointercancel', endSwitchDrag, { passive: true });

    switchBtns.forEach(b => b.addEventListener('click', () => {
        if (!sMoved) goto(b.dataset.page);
    }));
    backBtn.addEventListener('click', () => goto('home'));

    /* ==========================================================================
       COPY CONFIRMATION BUBBLE — above/below the tapped word (nudged right
       of centre), not fully to the right as on desktop: mobile's bio column
       is too narrow for that placement to stay on screen.
       ========================================================================== */
    const mCopiedEl = document.getElementById('m-copied');
    let mCopiedTimer = null;
    function showMobileCopied(anchor) {
        const r = anchor.getBoundingClientRect();
        mCopiedEl.style.visibility = 'hidden';
        mCopiedEl.classList.add('visible');
        requestAnimationFrame(() => {
            const pw = mCopiedEl.offsetWidth, ph = mCopiedEl.offsetHeight;
            let left = r.left + r.width / 2 - pw / 2 + 10;
            left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
            let top = r.top - ph - 10;
            if (top < 12) top = r.bottom + 10;
            mCopiedEl.style.left = left + 'px';
            mCopiedEl.style.top = top + 'px';
            mCopiedEl.style.visibility = '';
        });
        clearTimeout(mCopiedTimer);
        mCopiedTimer = setTimeout(() => mCopiedEl.classList.remove('visible'), 1500);
    }

    /* ==========================================================================
       CONTACT
       ========================================================================== */
    const Contact = (() => {
        const el = document.getElementById('contact');
        const items = [...el.querySelectorAll('.contact-item')];

        el.addEventListener('click', (e) => {
            if (!el.classList.contains('is-open')) { el.classList.add('is-open'); e.stopPropagation(); }
        });
        el.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !el.classList.contains('is-open')) {
                e.preventDefault(); el.classList.add('is-open');
            }
        });
        document.addEventListener('click', (e) => {
            if (el.classList.contains('is-open') && !el.contains(e.target)) el.classList.remove('is-open');
        });
        /* Shared so the Profile links reuse this exact copy + feedback path
           rather than duplicating it. */
        function copyValue(text, el) {
            const done = () => { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); };
            copyWithFeedback(text, done);
        }
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                copyValue(item.getAttribute('data-copy'), item);
            });
        });

        return {
            close() { el.classList.remove('is-open'); },
            ready() { el.classList.add('ready'); },
            copyValue
        };
    })();

    /* ==========================================================================
       PROFILE (mobile home) — clustered/expanded stack is pure CSS, this
       module only flips a class. Clock ticks once a minute, not once a
       second (display has no seconds).
       ========================================================================== */
    const Profile = (() => {
        const home = document.getElementById('home');
        const stack = document.getElementById('profile-stack');
        const bio = document.getElementById('profile-bio');
        const timeEl = document.getElementById('clock-time');

        /* Bio built as nodes rather than innerHTML so the link text can carry
           real listeners without re-parsing markup. */
        function buildBio() {
            const link = (key) => {
                const cfg = PROFILE_LINKS[key];
                const s = document.createElement('span');
                s.className = 'profile-link';
                s.textContent = cfg.name;
                s.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Contact.copyValue(cfg.url, s);
                    showMobileCopied(s);
                });
                return s;
            };
            bio.textContent = '';
            bio.append(
                'Hey, I\u2019m a Creative Technologist\nbased in Nairobi, Kenya.\n\nCreative Director at ',
                link('naivaa'),
                '\nCurrently building ',
                link('ati'),
                '\nDesigner, artist, and retired Professional Futsal Player\n(Don\u2019t fact-check this, just trust me.)\n\nI design stuff I wanna see in the world :)'
            );
        }

        function buildStack() {
            /* Back-to-front in DOM order so nth-child z-index in CSS reads
               naturally: photo 3 (the portrait) sits on top when clustered. */
            [PROFILE_PHOTOS[1], PROFILE_PHOTOS[2], PROFILE_PHOTOS[0]].forEach(src => {
                const card = document.createElement('div');
                card.className = 'profile-photo';
                const inner = document.createElement('div');
                inner.className = 'profile-photo-inner';
                const img = document.createElement('img');
                img.src = src;
                img.alt = '';
                img.loading = 'lazy';
                img.decoding = 'async';
                /* Same fallback as the desktop cluster above — falls back
                   to the card's own placeholder background instead of a
                   broken-image glyph. */
                img.onerror = () => { img.style.display = 'none'; };
                inner.appendChild(img);
                card.appendChild(inner);
                stack.appendChild(card);
            });
        }

        function toggleStack() {
            const expanded = stack.classList.contains('is-expanded');
            stack.classList.toggle('is-expanded', !expanded);
            stack.classList.toggle('is-clustered', expanded);
            stack.setAttribute('aria-label', expanded ? 'Expand photos' : 'Collapse photos');
        }
        stack.addEventListener('click', toggleStack);
        stack.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStack(); }
        });

        /* ---- clock ---- */
        let clockTimer = null;
        function renderClock() {
            const now = new Date();
            let h = now.getHours();
            const m = String(now.getMinutes()).padStart(2, '0');
            const suffix = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            timeEl.textContent = `${h}:${m} ${suffix}`;
        }
        function startClock() {
            renderClock();
            clearTimeout(clockTimer);
            /* Align the first tick to the next minute boundary, then run on a
               steady minute interval — no per-second work for a display that
               only shows minutes. */
            const msToNextMinute = 60000 - (Date.now() % 60000);
            clockTimer = setTimeout(function tick() {
                renderClock();
                clockTimer = setTimeout(tick, 60000);
            }, msToNextMinute);
        }

        function setSection(section) {
            /* Acts only on a real section change — re-entered mid-swipe via
               Carousel.onScroll -> setActive() -> Tab.setActive() -> here,
               and without this guard enterSection() would snap a live scroll
               to a card boundary on every project swiped past. */
            if (home.dataset.section === section) return;
            if (section !== 'projects') Carousel.interrupt({ sync: false });
            if (home.dataset.section === 'mindmap') MindMap.leave();
            home.dataset.section = section;
            if (section === 'mindmap' && currentPage === 'home') MindMap.enter();
            /* Re-measure on entering the projects section. The panels now
               keep real layout boxes in both states, but re-running layout
               here guarantees slideW reflects the current viewport before
               any jump is computed against it. */
            if (section === 'projects') Carousel.enterSection();
            /* Always return to the clustered state when leaving, so coming
               back to Profile is a consistent starting point. */
            if (section !== 'profile') {
                stack.classList.remove('is-expanded');
                stack.classList.add('is-clustered');
            }
        }

        buildBio();
        buildStack();
        startClock();

        return { setSection };
    })();

    /* ==========================================================================
       NAV — round Profile button beside the morphing bar. Routed through
       Tab.setActive() so it shares the tab icons' exact path (Tab is
       referenced lazily inside the handler, so declaring Nav first is safe).
       ========================================================================== */
    const Nav = (() => {
        const btn = document.getElementById('nav-profile-btn');
        btn.innerHTML = ICONS.profile;   /* same glyph the Profile tab used */
        function go() { Tab.setActive(PROFILE_TAB, false); }
        btn.addEventListener('click', go);
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
        return { reveal() { btn.classList.add('in'); } };
    })();

    /* ==========================================================================
       PROJECT TAB — indicator moves slot-to-slot on a constant-speed CSS
       transition. The bar doubles as the collapsed "Projects" button (see
       #tabbar CSS); drag/click handlers stand down while collapsed so a tap
       reads as "open Projects" rather than "grab the indicator".
       ========================================================================== */
    const Tab = (() => {
        const bar = document.getElementById('tabbar');
        const iconsEl = document.getElementById('tab-icons');
        const labelEl = document.querySelector('#projects-label span');
        const indicator = document.getElementById('tab-indicator');
        const homeEl = document.getElementById('home');
        /* btns stays index-aligned to PROJECTS — null in the Profile slot —
           so every existing caller keeps passing the same indices it always
           did. `order` is just the subset that actually has a tab, in bar
           order, for "first project" and nearest-slot lookups. */
        const btns = [];
        const order = [];
        let active = -1;

        const collapsed = () => homeEl.dataset.section !== 'projects';

        PROJECTS.forEach((p, i) => {
            /* Profile is the round button beside the bar now — it keeps its
               PROJECTS index, but holds a null slot here. */
            if (p.isProfile) { btns.push(null); return; }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tab-btn icon-' + p.key;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-label', p.name);
            b.setAttribute('aria-selected', 'false');
            b.innerHTML = ICONS[p.key];
            b.addEventListener('click', () => {
                if (dragMoved) return;
                Carousel.jumpToProject(i);
            });
            iconsEl.appendChild(b);
            btns.push(b);
            order.push(i);
        });

        /* The tab a given PROJECTS index should light up. Profile has none, so
           it falls back to the first slot: the bar then always collapses from
           — and re-expands to — the same resting position, which is also
           where the "Projects" button sends you. */
        function slotFor(i) { return btns[i] ? i : order[0]; }
        function xFor(i) { const b = btns[i]; return b ? b.offsetLeft : 0; }

        /* The capsule is drawn IND_PAD wider than the icon slot it marks and
           sits half of that to the left of it, so it stays centred on the
           icon while extending closer to the bar's edge. Every read and write
           of the indicator's position goes through indX() so the drag
           handling, the nearest-slot snap and the resting position can never
           disagree about which coordinate space they're in. */
        const IND_PAD = 6;
        function indX(i) { return xFor(i) - IND_PAD / 2; }

        /* Both morph widths, measured from real layout rather than hard-coded,
           so they stay correct if the icon count, the bar's padding or the
           label's type metrics ever change. Safe to read while collapsed:
           overflow:hidden clips the icons but does not move them, and
           .tab-btn is flex: 0 0 56px so the narrow bar cannot squash them. */
        function measure() {
            const last = btns[order[order.length - 1]];
            if (!last) return;
            const padRight = parseFloat(getComputedStyle(bar).paddingRight) || 0;
            const open = Math.round(last.offsetLeft + last.offsetWidth + padRight);
            const closed = Math.round((labelEl ? labelEl.getBoundingClientRect().width : 60) + 46);
            root.style.setProperty('--tabbar-w-open', open + 'px');
            root.style.setProperty('--tabbar-w-closed', closed + 'px');
        }

        function layout() {
            measure();
            indicator.style.width = (btns[order[0]].offsetWidth + IND_PAD) + 'px';
            if (active >= 0) indicator.style.transform = `translateX(${indX(slotFor(active))}px)`;
        }

        function setActive(i, instant) {
            if (i < 0) return;
            const section = PROJECTS[i].isProfile ? 'profile' : 'projects';
            if (i === active) { Profile.setSection(section); return; }
            active = i;
            btns.forEach((b, k) => { if (b) b.setAttribute('aria-selected', String(k === i)); });
            if (instant) indicator.style.transition = 'none';
            /* On the way to Profile the indicator glides back to the first
               slot while the bar collapses around it, so the icons read as
               gathering into the pill rather than the capsule vanishing. */
            indicator.style.transform = `translateX(${indX(slotFor(i))}px)`;
            if (instant) requestAnimationFrame(() => { indicator.style.transition = ''; });
            /* Section swap rides the same call that moves the highlight and
               recolours the icon, so the three stay in step instead of racing
               each other from separate triggers. */
            Profile.setSection(PROJECTS[i].isProfile ? 'profile' : 'projects');
        }

        function morph() {
            layout();
            /* Seeds the indicator's position/width before the bar fades in — without
               this, layout()'s positioning (gated on active >= 0) had nothing
               to work with until Carousel.reveal() set it ~1.3s later, so the
               indicator sat at its raw CSS position and visibly snapped. */
            if (homeEl.dataset.section !== 'mindmap') setActive(PROFILE_TAB, true);
            bar.classList.add('in');
            Nav.reveal();
            MindMap.reveal();
            setTimeout(() => {
                /* Iterate `order`, NOT `btns` — btns carries a null in the
                   Profile slot since Profile became the round button beside
                   the bar. Indexing straight into btns threw here, and because
                   the throw happened before the next line, `icons-in` was
                   never added and every .tab-btn stayed at its opacity:0 base
                   forever. That was the "project icons invisible" bug. */
                order.forEach((pi, n) => { btns[pi].style.animationDelay = (n * 0.13) + 's'; });
                bar.classList.add('icons-in');
            }, 460);
        }

        let dragMoved = false;
        let dragging = false;
        let dragStartX = 0;
        let dragBaseX = 0;

        /* Collapsed, the whole bar is the "Projects" button (icons are
           pointer-events:none). `true` = jump without the tween — the
           carousel is still behind the cross-fade, so animating scrollLeft
           would be motion nobody can see. */
        function openProjects() {
            if (dragMoved) return;
            Carousel.jumpToProject(order[0], true);
        }
        bar.addEventListener('click', () => { if (collapsed()) openProjects(); });
        bar.addEventListener('keydown', (e) => {
            if (!collapsed()) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProjects(); }
        });

        bar.addEventListener('pointerdown', (e) => {
            /* Must run BEFORE the collapsed early-return below (previously didn't).
               dragMoved is set by >4px pointer movement — including finger
               jitter on a plain tap — and only cleared by the next
               pointerdown. While collapsed that return skipped the reset, so
               one jittery expanded-bar tap left openProjects()'s `if
               (dragMoved) return` permanently blocking the Projects pill. */
            dragMoved = false;
            Carousel.interrupt();
            /* No indicator to grab while the bar is a button. */
            if (collapsed()) return;
            dragging = true;
            dragStartX = e.clientX;
            dragBaseX = indX(slotFor(active < 0 ? order[0] : active));
            bar.classList.add('dragging');
            /* Pointer capture is NOT taken here. Capturing on pointerdown
               redirects the whole gesture to `bar`, which makes `bar` the
               common ancestor for the click dispatch — so an ordinary tap's
               click can be delivered to the bar instead of the .tab-btn that
               was actually pressed, and the project switch silently does
               nothing. Capture is only needed once a real drag is underway,
               so it's taken in pointermove past the threshold instead. */
        }, { passive: true });

        bar.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - dragStartX;
            if (Math.abs(dx) > 4 && !dragMoved) {
                dragMoved = true;
                /* Now, and only now, is this a drag rather than a tap. */
                try { bar.setPointerCapture(e.pointerId); } catch (err) {}
            }
            const x = clamp(dragBaseX + dx, indX(order[0]), indX(order[order.length - 1]));
            indicator.style.transform = `translateX(${x}px)`;
        }, { passive: true });

        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            bar.classList.remove('dragging');
            /* Implicit release already happens on pointerup/pointercancel;
               this is belt-and-braces for the case where the element is
               re-rendered or the pointer is lost some other way, so capture
               can never outlive the gesture that took it. */
            if (e && e.pointerId != null) {
                try { bar.releasePointerCapture(e.pointerId); } catch (err) {}
            }
            if (!dragMoved) return;
            const m = /translateX\(([-\d.]+)px\)/.exec(indicator.style.transform);
            const x = m ? parseFloat(m[1]) : indX(slotFor(active));
            let nearest = order[0], best = Infinity;
            order.forEach((i) => { const d = Math.abs(indX(i) - x); if (d < best) { best = d; nearest = i; } });
            Carousel.jumpToProject(nearest);
        }
        bar.addEventListener('pointerup', endDrag, { passive: true });
        bar.addEventListener('pointercancel', endDrag, { passive: true });

        return { morph, setActive, layout };
    })();

    /* Named exceptions: these files present full-bleed (logos, product renders)
       rather than rounded — corner radius would fight their own clean edges. */
    const NO_ROUND = new Set([
        'home-front.webp', 'training-front.webp',
        'naivaalogo.png', 'athousandislandslogo.png', 'alex.png'
    ]);
    const basename = (p) => p.split('/').pop();

    /* ==========================================================================
       CAROUSEL — one dominant image per native swipe, fixed-size frame via
       object-fit:contain so it never drives layout. Every src is assigned
       immediately. The shared project-transition controller owns the fade,
       image/caption commit and cancellation on a new gesture.
       ========================================================================== */
    const Carousel = createCarousel({ PROJECTS, CARDS, PROJECT_START, PROFILE_TAB, Tab, NO_ROUND, basename, derivedURL, REDUCED, clamp });

    /* ==========================================================================
       GALLERY — Echo-style vertical 3D carousel, ported from the user's
       other site. #gallery-scroll is a real native-scroll element (spacer
       child just generates range); #gallery-viewport is JS-transformed per
       card from that scroll position. Poster: preload="metadata" + nudge
       currentTime to 0.6s (several clips open near-black) rather than an
       extra video/canvas element. Up to MAX_CONCURRENT videos can genuinely
       play at once, not one-decoder-at-a-time.
       ========================================================================== */
    const Gallery = createGallery({ root, REDUCED, clamp });
    const MindMap = createMindMapUI({ reduced: REDUCED });
    document.getElementById('nav-mindmap-btn').addEventListener('click', () => Profile.setSection('mindmap'));
    window.addEventListener('pagehide', event => event.persisted ? MindMap.leave() : MindMap.dispose());
    window.addEventListener('pageshow', event => {
        if (event.persisted && currentPage === 'home' && pages.home.dataset.section === 'mindmap') MindMap.enter();
    });


    /* ==========================================================================
       LAYOUT / RESIZE — trailing settle timer (same pattern as the desktop
       Viewport module): an orientation change fires several resize events in
       quick succession, and the immediate rAF-coalesced pass could lock in a
       still-transitional frame. relayout(true), fired 220ms after the last
       event of the burst, forces convergence on the real settled size.
       ========================================================================== */
    let lastW = window.innerWidth, lastH = window.innerHeight, resizeRAF = 0, settleTimer = null;

    function relayout(force) {
        const w = window.innerWidth, h = window.innerHeight;
        const meaningful = force || (w !== lastW) || Math.abs(h - lastH) > 130;
        lastW = w; lastH = h;
        if (!meaningful) return;
        const orient = currentOrient();
        if (root.dataset.orient !== orient) root.dataset.orient = orient;
        Carousel.layout(); Gallery.layout(); Tab.layout(); moveThumb(true);
    }

    /* Latches while zoomed so the way out is guaranteed a real re-layout —
       without it, a return to scale 1 with no further resize event leaves
       the layout frozen at the pre-zoom units. */
    let wasZoomed = false;

    function onResize() {
        /* Same reasoning as writeViewportUnits: a pinch fires visualViewport
           resize events, and re-running Carousel/Gallery/Tab layout at the
           zoomed scale is what corrupted slideW and the tile geometry. */
        if (isZoomed()) { wasZoomed = true; return; }
        if (wasZoomed) {
            /* Unconditional full pass on the way out — force:true, since the
               dimensions may well be identical to the pre-zoom ones and the
               `meaningful` gate would otherwise skip the recovery. */
            wasZoomed = false;
            writeViewportUnits();
            relayout(true);
        }
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { writeViewportUnits(); relayout(true); }, 220);

        if (resizeRAF) return;
        resizeRAF = requestAnimationFrame(() => {
            resizeRAF = 0;
            /* --mvh/--mvw are refreshed on EVERY resize, including the small
               URL-bar-only height changes the `meaningful` gate deliberately
               ignores — those still change the real visible area, so CSS
               that must fit the screen has to track them. Only the expensive
               relayout work is gated. */
            writeViewportUnits();
            relayout(false);
        });
    }
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onResize, { passive: true });
        /* Scale can settle back to 1 while only scroll events are being
           emitted. Cheap: this does nothing at all unless a zoom is currently
           latched and has just ended. */
        window.visualViewport.addEventListener('scroll', () => {
            if (wasZoomed && !isZoomed()) onResize();
        }, { passive: true });
    }

    /* ==========================================================================
       BOOT
       ========================================================================== */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    requestAnimationFrame(() => {
        moveThumb(true);
        Carousel.layout();

        /* ---- ARRIVAL SEQUENCE (mobile Profile) ----
           Header/nav -> tiles -> bio -> clock, ~1.5s total. Each stage is a
           class flip; easing lives on the elements so one curve decelerates
           the whole page. */
        setTimeout(() => { switcher.classList.add('ready'); Contact.ready(); }, 90);

        setTimeout(() => {
            Carousel.start();
            Carousel.whenImagesSettled().then(() => {
                const connection = navigator.connection;
                if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
                const prepare = () => MindMap.prepare();
                if ('requestIdleCallback' in window) requestIdleCallback(prepare, {timeout:2000});
                else setTimeout(prepare, 300);
            });
            /* Applies the same `arrive` class goto() sets on navigation — a fresh
               load never got it otherwise. Its homeRise transform (fill-mode:
               both) is what promotes #carousel to its own compositing layer,
               which is why the carousel was only responsive after a
               Gallery round-trip and not on first load. Converges both
               paths onto one state; not a new listener or reinit. */
            pages.home.classList.remove('arrive');
            void pages.home.offsetWidth;
            pages.home.classList.add('arrive');
        }, 170);

        setTimeout(() => {
            Tab.morph();
            /* 460ms bar settle + 4 icons x 150ms stagger + 420ms land ~= 1330ms
               after morph() is called — title/meta reveal the instant the last
               icon has settled. */
            setTimeout(() => Carousel.reveal(), 1330);
        }, 250);

        /* Stages 2-4. REDUCED collapses them to a single frame rather than
           leaving content waiting on timers it will never see move. */
        /* Tiles land at 560; the last card's fade ends at 560+180+460 = 1200
           and the group settle at 560+620 = 1180, so the bio genuinely starts
           after the tiles have settled rather than over the top of them. */
        const stages = [['arr-tiles', 560], ['arr-bio', 1240], ['arr-clock', 1520]];
        if (REDUCED) {
            stages.forEach(([cls]) => root.classList.add(cls));
        } else {
            stages.forEach(([cls, at]) => setTimeout(() => root.classList.add(cls), at));
        }
    });

    /* Debug handle — nothing in the app reads from window. */
    window.__mobile = { Carousel, Gallery, Tab, goto, DPR };

}


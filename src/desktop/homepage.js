import { imageUrl } from '../shared/media.js';
import { copyWithFeedback } from '../shared/clipboard.js';
import { PROFILE_PHOTOS, PROFILE_LINKS } from '../shared/profile.js';
import { VaultBridge } from '../shared/vault-bridge.js';

export function initDesktopHomepage() {
    const el = document.getElementById('homepage');
    const stack = document.getElementById('hp-stack');
    const bio = document.getElementById('hp-bio');
    const enterBtn = document.getElementById('hp-enter-btn');
    const nameBtn = document.getElementById('hp-name-btn');
    const preview = document.getElementById('hp-preview');
    const pvIcon = preview.querySelector('.hp-preview-icon');
    const pvName = preview.querySelector('.hp-preview-name');
    const pvUrl = preview.querySelector('.hp-preview-url');
    const copied = document.getElementById('hp-copied');

    /* Reuses the tab-bar glyphs as the preview "favicons" — already inline
       in the bundle, so the preview costs no extra request and never
       contacts the target site. */
    const PREVIEW_ICONS = {
        naivaa: `<svg viewBox="0 0 207.7 200.9" aria-hidden="true"><path d="M103.9,30.8c-38.5,0-69.7,31.2-69.7,69.7s31.2,69.6,69.7,69.6,69.7-31.2,69.7-69.6S142.3,30.8,103.9,30.8ZM137.4,142.7h-18.3c-2.2,0-5.2-1.3-6.7-2.9l-25.2-27.2c-1.5-1.6-2.7-1.1-2.7,1.1v25.1c0,2.2-1.8,4-4,4h-10.1c-2.2,0-4-1.8-4-4v-67.1c0-2.2,1.3-2.7,2.8-1.2l69.5,69.5c1.5,1.5,1,2.8-1.2,2.8ZM141.4,128.8c0,2.2-1.3,2.7-2.8,1.2L69.6,61c-1.5-1.5-1-2.8,1.2-2.8h15.4c1,0,3,1.3,4.6,2.8l29.7,29.6c1.6,1.6,2.8,1,2.8-1.2v-27.2c0-2.2,1.8-4,4-4h10.1c2.2,0,4,1.8,4,4v66.6Z"/></svg>`,
        ati: `<svg viewBox="0 0 764.5 703.5" aria-hidden="true"><path fill-rule="evenodd" d="M323.8,239.7c33.9-2.5,76.4-1.2,110.4.8,26.8,1.6,36.1,2.4,59.5,16.4,19.8,11.9,80.1,51.4,92.7,67.3s9.7,16.6,11.5,25.8c3.9,20,5.3,72-2.5,90.3-11.2,26.3-47.9,26-72.2,24.1-53.5-4.2-101.8-74.1-146.8-69.9-30.1,2.8-73.8,47.8-104.8,61.3-27.1,11.8-88.2,18-102.5-15.1-8-18.7-7.1-82.5,0-101.8s50.2-47.9,69.2-60.8c29-19.8,48.7-35.7,85.6-38.4ZM374.3,258.9c-34.3,4.7-75.8,56.4-116.7,67.4-28.5,7.7-64.9-4.8-78.6,29.8s-9.6,69.5,19.2,72.2,67.2-37.5,94.9-48.4c21-8.2,55.1-4.2,78.5-4.5s76.2-7.1,106.5,7.7c25.8,12.7,98.4,80.6,110.3,20.2,4-20.5,1.7-50.3-15.9-64-16.6-13-39.2-7.5-58.6-11.2-33.8-6.5-60.7-32.9-88.4-51.2-16.7-11-29.7-20.9-51.2-18Z"/></svg>`
    };

    function prettyUrl(u) {
        return u.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    /* Sits to the right of the anchor word (was centred above/below, which
       overlapped bio text); falls back left near a viewport edge, clamped.
       `gap`/`lift` let the preview and copy bubble offset differently so
       neither crowds the other. Measured a frame late since width isn't
       known until content is in. */
    function placeOver(target, anchor, gap = 14, lift = 0) {
        const r = anchor.getBoundingClientRect();
        target.style.visibility = 'hidden';
        target.classList.add('visible');
        requestAnimationFrame(() => {
            const pw = target.offsetWidth, ph = target.offsetHeight;
            let left = r.right + gap;
            if (left + pw > window.innerWidth - 16) left = r.left - pw - gap;
            left = Math.max(16, Math.min(left, window.innerWidth - pw - 16));
            let top = r.top + r.height / 2 - ph / 2 - lift;
            top = Math.max(16, Math.min(top, window.innerHeight - ph - 16));
            target.style.left = left + 'px';
            target.style.top = top + 'px';
            target.style.visibility = '';
        });
    }

    let pvTimer = null;
    function showPreview(key, anchor) {
        const cfg = PROFILE_LINKS[key];
        pvIcon.innerHTML = PREVIEW_ICONS[key] || '';
        pvName.textContent = cfg.name;
        pvUrl.textContent = prettyUrl(cfg.url);
        /* Further right and slightly higher than the copied bubble, so it
           sits clearly clear of the word rather than centred on its line. */
        placeOver(preview, anchor, 20, 8);
    }
    function hidePreview() {
        clearTimeout(pvTimer);
        preview.classList.remove('visible');
    }

    let copiedTimer = null;
    function showCopied(anchor) {
        /* The hover preview and the confirmation would otherwise stack on
           the same spot — the confirmation is the more important message. */
        hidePreview();
        placeOver(copied, anchor, 20);
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => copied.classList.remove('visible'), 1500);
    }
    function hideCopied() {
        clearTimeout(copiedTimer);
        copied.classList.remove('visible');
    }

    function buildBio() {
        const link = (key) => {
            const cfg = PROFILE_LINKS[key];
            const s = document.createElement('span');
            s.className = 'hp-link';
            s.textContent = cfg.name;
            s.addEventListener('mouseenter', () => {
                clearTimeout(pvTimer);
                pvTimer = setTimeout(() => showPreview(key, s), 140);
            });
            s.addEventListener('mouseleave', hidePreview);
            /* Copy rather than navigate — the visitor stays on the site. */
            s.addEventListener('click', () => {
                const done = () => {
                    s.classList.add('is-copied');
                    showCopied(s);
                    setTimeout(() => s.classList.remove('is-copied'), 1400);
                };
                copyWithFeedback(cfg.url, done);
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
        /* Back-to-front so nth-child z-index reads naturally: the portrait
           sits on top when clustered. */
        [PROFILE_PHOTOS[1], PROFILE_PHOTOS[2], PROFILE_PHOTOS[0]].forEach(src => {
            const card = document.createElement('div');
            card.className = 'hp-photo';
            const inner = document.createElement('div');
            inner.className = 'hp-photo-inner';
            const img = document.createElement('img');
            img.src = imageUrl(src, 220, Math.min(devicePixelRatio, 2)); img.alt = ''; img.decoding = 'async';
            /* A missing/failed photo previously left a broken-image glyph
               sitting inside the card. Hiding it falls back to the card's
               own #bdbdbd background — a plain placeholder, not a visibly
               broken one. */
            img.onerror = () => { img.style.display = 'none'; };
            inner.appendChild(img);
            card.appendChild(inner);
            stack.appendChild(card);
        });
    }

    /* Hover-expand gated to (hover:hover)+(pointer:fine), checked once at
       setup. A touch tap synthesises mouseenter with no matching leave, so
       ungated this stuck the cluster open on tablets — same input-capability
       assumption used by the mind map's hover/touch split. */
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        stack.addEventListener('mouseenter', () => {
            stack.classList.remove('is-clustered');
            stack.classList.add('is-expanded');
        });
        stack.addEventListener('mouseleave', () => {
            stack.classList.remove('is-expanded');
            stack.classList.add('is-clustered');
        });
    } else {
        /* Same tap-to-toggle used on mobile's own #profile-stack — proven
           there, reused here verbatim rather than writing a second version
           of the same interaction. */
        const toggleStack = () => {
            const expanded = stack.classList.contains('is-expanded');
            stack.classList.toggle('is-expanded', !expanded);
            stack.classList.toggle('is-clustered', expanded);
        };
        stack.setAttribute('role', 'button');
        stack.setAttribute('tabindex', '0');
        stack.addEventListener('click', toggleStack);
        stack.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStack(); }
        });
    }

    let goneTimer = null;
    let enterPending = false;

    function proceedIntoVault() {
        enterPending = false;
        enterBtn.textContent = 'Enter The Vault';
        hidePreview();
        hideCopied();
        el.classList.add('leaving');
        /* The arrival is part of entering, not a one-time intro — the Vault
           side (resetVaultToOrb + startVaultEntrance, wired in via
           VaultBridge.markReady) winds itself back and replays every time. */
        VaultBridge.enter();
        /* Matches the CSS opacity transition, then drops the overlay out
           of the document flow entirely. */
        clearTimeout(goneTimer);
        goneTimer = setTimeout(() => el.classList.add('gone'), 900);
    }

    function enterVault() {
        if (enterPending) return;
        /* Already known broken (e.g. the person clicked once, waited, saw the
           notice, dismissed it, and clicks again) — show it again immediately
           rather than re-entering a "Loading…" state that will never change. */
        if (VaultBridge.failed) { showWebglNotice(); return; }
        if (!VaultBridge.ready) {
            /* The Vault's THREE.js/GSAP CDN chain hasn't finished yet — queue
             the entrance instead of doing nothing, so a fast click right after
             page load still works once loading completes. */
            enterPending = true;
            enterBtn.textContent = 'Loading\u2026';
            VaultBridge.onSettle(() => {
                enterPending = false;
                enterBtn.textContent = 'Enter The Vault';
                /* This is the fix for the stuck "Loading…" button: previously
                   markReady() was the only way out of this state, and a thrown
                   WebGL error meant it was never called, so the label sat here
                   forever. onSettle() now also resolves on VaultBridge.fail(),
                   so the button always reaches a real, honest end state. */
                if (VaultBridge.failed) showWebglNotice(); else proceedIntoVault();
            });
            return;
        }
        proceedIntoVault();
    }
    enterBtn.addEventListener('click', enterVault);

    /* ==========================================================================
       ARRIVAL SEQUENCER (desktop) — buttons -> tiles -> bio. Replays on
       every return from the Vault, matching the Vault's own entrance.
       ========================================================================== */
    const ARRIVE_RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ARRIVE_STAGES = [
        ['arr-btns', 80],
        /* Last card's fade ends at 520+200+480 = 1200, group settle at
           520+660 = 1180 — the bio waits for both. */
        ['arr-tiles', 520],
        ['arr-bio', 1240]
    ];
    let arrivalTimers = [];

    function runArrival() {
        arrivalTimers.forEach(clearTimeout);
        arrivalTimers = [];
        ARRIVE_STAGES.forEach(([cls]) => el.classList.remove(cls));
        if (ARRIVE_RM) {
            /* No staging when motion is reduced — everything is simply present.
               Applied here rather than left to the timers so the page is never
               waiting on a sequence it isn't going to show. */
            ARRIVE_STAGES.forEach(([cls]) => el.classList.add(cls));
            return;
        }
        /* Forced reflow so a replay actually restarts from the start state
           instead of the browser coalescing remove+add into no change. */
        void el.offsetWidth;
        ARRIVE_STAGES.forEach(([cls, at]) => {
            arrivalTimers.push(setTimeout(() => el.classList.add(cls), at));
        });
    }

    /* The name button returns here from anywhere in the Vault. */
    function show() {
        /* Cancel a pending hide — otherwise a fast Vault -> Home bounce
           would re-apply display:none moments after we un-applied it. */
        clearTimeout(goneTimer);
        goneTimer = null;
        hideCopied();
        el.classList.remove('gone');
        requestAnimationFrame(() => { el.classList.remove('leaving'); runArrival(); });
    }
    nameBtn.addEventListener('click', () => { /* already home */ });

    /* Contact dropdown on the homepage — same copy-and-confirm behaviour as
       the Vault's own, plus its own open/close handling. Pure DOM, so it
       lives here rather than inside initDesktop() as well. */
    (() => {
        const hpContact = document.getElementById('hp-contact-btn');
        const open = () => hpContact.classList.add('is-open');
        const close = () => hpContact.classList.remove('is-open');

        /* Gated to real mice — a touch tap synthesises mouseenter before its own
           click fires, so hover opened this and the click immediately shut
           it again, and tapping Contact did nothing on tablets. */
        if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
            hpContact.addEventListener('mouseenter', open);
            hpContact.addEventListener('mouseleave', close);
        }
        hpContact.addEventListener('click', (e) => {
            e.stopPropagation();
            hpContact.classList.toggle('is-open');
        });
        hpContact.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hpContact.classList.toggle('is-open'); }
            if (e.key === 'Escape') close();
        });
        document.addEventListener('click', close);

        hpContact.querySelectorAll('.contact-item').forEach(item => {
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
    })();

    buildBio();
    buildStack();
    /* buildStack() has to have run first — the cards the tile stage reveals
       don't exist before it. */
    requestAnimationFrame(runArrival);

    return { show, enterVault };
}


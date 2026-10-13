import { installAccessibility } from './shared/accessibility.js';
import './styles/site.css';
import { initDesktopHomepage } from './desktop/homepage.js';
import { initDesktop } from './desktop/index.js';
import { initMobile } from './mobile/index.js';
import { VaultBridge } from './shared/vault-bridge.js';

function showWebglNotice() {
    const el = document.getElementById('webgl-notice');
    if (!el) return;
    el.classList.add('visible');
    /* Deferred one tick so the SAME click that opened the notice (the Enter
       The Vault press) doesn't immediately bubble into this listener and
       close it again before the person has seen it. */
    setTimeout(() => document.addEventListener('click', onWebglNoticeOutsideClick), 0);
}
function hideWebglNotice() {
    const el = document.getElementById('webgl-notice');
    if (el) el.classList.remove('visible');
    document.removeEventListener('click', onWebglNoticeOutsideClick);
}
function onWebglNoticeOutsideClick(e) {
    const el = document.getElementById('webgl-notice');
    if (el && !el.contains(e.target)) hideWebglNotice();
}
document.getElementById('webgl-notice-close').addEventListener('click', hideWebglNotice);

const __isMobile = document.documentElement.dataset.exp === 'mobile';
if (__isMobile) {
    initMobile();
} else {
    /* Built first, synchronously, so the Profile page is on screen and fully
       interactive before initDesktop's CDN-dependent Vault setup even starts. */
    const Homepage = initDesktopHomepage();
    /* This .catch() fixes the stuck "Loading…" button: initDesktop is async
       and had no .catch, so a synchronous throw (e.g. WebGLRenderer) became
       an unhandled rejection, and VaultBridge.markReady() — the only thing
       that clears "Loading…" — sat thousands of lines later, unreached.
       Routing into VaultBridge.fail() gives enterVault() a terminal state,
       and covers any future error in the init chain, not just this line. */
    initDesktop(Homepage).catch((err) => {
        console.error('[Vault] disabled — WebGL/graphics init failed:', err);
        VaultBridge.fail(err);
    });
}

installAccessibility();

export function installAccessibility() {
    function keyboardControls(root) {
        root.querySelectorAll('[data-copy], .hp-link, .profile-link, #pulse-skip').forEach(element => {
            if (element.dataset.keyboardReady) return;
            element.dataset.keyboardReady = 'true';
            element.setAttribute('role', 'button');
            element.tabIndex = 0;
            element.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    element.click();
                }
            });
        });
    }
    const hide = (element, hidden) => {
        if (!element) return;
        element.inert = hidden;
        element.setAttribute('aria-hidden', String(hidden));
    };
    const homepage = document.getElementById('homepage');
    function syncDesktop() {
        const isMobile = document.documentElement.dataset.exp === 'mobile';
        const atHome = !homepage.classList.contains('gone') && !homepage.classList.contains('leaving');
        hide(document.getElementById('desktop-root'), isMobile);
        hide(document.getElementById('mobile-root'), !isMobile);
        hide(homepage, !atHome);
        const active = document.getElementById('scene-three').style.pointerEvents === 'auto' ? 3
            : document.getElementById('scene-two').style.pointerEvents === 'auto' ? 2 : 1;
        ['scene-one','scene-two','scene-three'].forEach((id, index) => hide(document.getElementById(id), atHome || index + 1 !== active));
    }
    const sceneObserver = new MutationObserver(syncDesktop);
    [homepage, ...['scene-one','scene-two','scene-three'].map(id => document.getElementById(id))].forEach(element => sceneObserver.observe(element, { attributes: true, attributeFilter: ['class','style'] }));
    ['contact','contact-btn','hp-contact-btn'].forEach(id => {
        const control = document.getElementById(id);
        const sync = () => {
            const open = control.classList.contains('is-open');
            control.setAttribute('aria-expanded', String(open));
            hide(control.querySelector('.contact-list, #contact-list'), !open);
        };
        new MutationObserver(sync).observe(control, { attributes: true, attributeFilter: ['class'] });
        sync();
    });
    ['pulse-notice','pulse-onboard','pulse-denied','pulse-input-blocked','webgl-notice','pulse-toggle'].forEach(id => {
        const panel = document.getElementById(id);
        const sync = () => hide(panel, !panel.classList.contains('visible'));
        new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
        sync();
    });
    ['collection-info','close-btn'].forEach(id => {
        const panel = document.getElementById(id);
        const sync = () => hide(panel, !panel.classList.contains('active'));
        new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
        sync();
    });
    const mobile = document.getElementById('mobile-root');
    const syncMobile = () => {
        const atHome = mobile.dataset.page !== 'gallery';
        hide(document.getElementById('home'), !atHome);
        hide(document.getElementById('gallery'), atHome);
        const section = document.getElementById('home').dataset.section;
        const profile = section === 'profile';
        hide(document.getElementById('profile-panel'), !profile);
        hide(document.getElementById('profile-clock'), !profile);
        hide(document.getElementById('projects-panel'), section !== 'projects');
        hide(document.getElementById('mobile-mindmap-panel'), section !== 'mindmap');
    };
    new MutationObserver(syncMobile).observe(mobile, { attributes: true, attributeFilter: ['data-page'], subtree: false });
    new MutationObserver(syncMobile).observe(document.getElementById('home'), { attributes: true, attributeFilter: ['data-section'] });
    new MutationObserver(() => keyboardControls(document)).observe(document.body, { childList: true, subtree: true });
    keyboardControls(document);
    syncDesktop();
    syncMobile();
}

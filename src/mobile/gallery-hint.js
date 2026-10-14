const KEY = 'portfolio-gallery-swipe-visits';
export function createGalleryHint({ element, storage, reduced }) {
    let visits = 0, timer = null;
    try { visits = Math.max(0, Number(storage?.getItem(KEY)) || 0); } catch {}
    function dismiss() { clearTimeout(timer); element.classList.remove('shown'); }
    return {
        enter() {
            dismiss();
            if (visits >= 2) return;
            visits++;
            try { storage?.setItem(KEY, String(visits)); } catch {}
            element.hidden = false;
            void element.offsetWidth;
            element.classList.add('shown');
            timer = setTimeout(dismiss, reduced ? 9000 : 10500);
        },
        dismiss,
    };
}

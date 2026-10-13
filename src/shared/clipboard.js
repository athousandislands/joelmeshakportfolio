export async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* Try the user-gesture fallback before reporting failure. */ }
    const active = document.activeElement;
    const field = document.createElement('textarea');
    field.value = text;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* No clipboard support. */ }
    field.remove();
    active?.focus({ preventScroll: true });
    return copied;
}

export async function copyWithFeedback(text, onSuccess) {
    if (await copyText(text)) { onSuccess(); return; }
    let notice = document.getElementById('copy-failure');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'copy-failure';
        notice.setAttribute('role', 'status');
        document.body.appendChild(notice);
    }
    notice.textContent = 'Could not copy. Please try again.';
    notice.hidden = false;
    clearTimeout(copyWithFeedback.timer);
    copyWithFeedback.timer = setTimeout(() => { notice.hidden = true; }, 3000);
}

export const MAP_COPY = [
    'A glimpse into my mind. This mind map gathers inspiration from different cult brands, creatives and designers.',
    'These references meet in a space between precision and play',
    'Louis Vuitton, Off-White and Maison Margiela offer different ways to rethink identity',
    // Short excerpts verified against the sources below; attribution is visible.
    // https://www.moma.org/artists/370-jean-michel-basquiat
    '“I cross out words so you will see them more.” — Jean-Michel Basquiat',
    // https://www.gq.com/video/watch/virgil-abloh-kanye-off-white-video-ian-connor-luka-sabbat
    '“It’s all like an open book diary for me to be myself.” — Virgil Abloh',
    // https://cfda.com/news/fashion-pays-tribute-to-virgil-abloh/
    '“You can do it too.” — Virgil Abloh',
];

// An eased estimate of preparation work, not a downloaded-byte percentage.
// Half the completed work maps to 60%; 100 is reserved for a successful reveal.
export function displayProgress(actual, ready = false) {
    return ready ? 100 : Math.min(99, Math.floor(100 * (1 - Math.pow(1 - Math.max(0, Math.min(1, actual)), 1.322))));
}

export function createMapLoading({ root, track, number, copy, reduced }) {
    let actual = 0, value = 0, target = 0, frame = 0, timer = null, copyTimer = null, index = 0, running = false;
    function paint() {
        track.style.width = `${value}%`;
        root.setAttribute('aria-valuenow', String(Math.floor(value)));
        number.textContent = `${Math.floor(value)}%`;
    }
    function animate() {
        frame = 0;
        if (!running) return;
        value = Math.min(target, value + Math.max(.25, (target - value) * .09));
        paint();
        if (value < target) frame = requestAnimationFrame(animate);
    }
    function scheduleCopy() {
        timer = setTimeout(() => {
            if (!running) return;
            copy.classList.add('changing');
            copyTimer = setTimeout(() => {
                index = (index + 1) % MAP_COPY.length;
                copy.textContent = MAP_COPY[index]; copy.classList.remove('changing'); scheduleCopy();
            }, reduced ? 0 : 350);
        }, Math.max(7000, MAP_COPY[index].split(/\s+/).length * 330 + 1800));
    }
    function stop() { running = false; cancelAnimationFrame(frame); clearTimeout(timer); clearTimeout(copyTimer); frame = 0; }
    return {
        progress(next) {
            actual = Math.max(actual, next); target = Math.max(target, displayProgress(actual));
            if (running && !frame) { if (reduced) { value = target; paint(); } else frame = requestAnimationFrame(animate); }
        },
        start() {
            stop(); running = true; index = 0; value = 0; target = displayProgress(actual);
            copy.textContent = MAP_COPY[0]; copy.classList.remove('changing'); paint();
            root.style.opacity = '1'; root.setAttribute('aria-hidden', 'false');
            scheduleCopy(); frame = requestAnimationFrame(animate);
        },
        complete() { stop(); actual = 1; value = target = 100; paint(); },
        reset() { stop(); actual = value = target = 0; paint(); },
        stop,
    };
}

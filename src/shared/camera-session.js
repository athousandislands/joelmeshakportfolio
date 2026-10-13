// A setup attempt owns its camera, including streams returned after cancellation.
export function createCameraSession({ getUserMedia, loadModel, attachVideo, playVideo, onStage = () => {}, cameraTimeout = 30000, modelTimeout = 45000 }) {
    let generation = 0;
    let stream = null;
    let rejectPending = null;
    const stop = value => value?.getTracks().forEach(track => track.stop());

    function cancel() {
        generation++;
        rejectPending?.(new Error('Setup cancelled'));
        rejectPending = null;
        stop(stream);
        stream = null;
        attachVideo(null);
    }

    async function start() {
        cancel();
        const id = generation;
        const cancelled = new Promise((_, reject) => { rejectPending = reject; });
        async function stage(label, operation, timeout) {
            onStage(label);
            let timer;
            try {
                return await Promise.race([
                    operation,
                    cancelled,
                    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), timeout); }),
                ]);
            } finally { clearTimeout(timer); }
        }
        try {
            const pendingStream = Promise.resolve().then(getUserMedia).then(value => {
                if (id !== generation) { stop(value); throw new Error('Setup cancelled'); }
                stream = value;
                attachVideo(value);
                return value;
            });
            await stage('Requesting camera', pendingStream, cameraTimeout);
            await stage('Starting camera', Promise.resolve().then(playVideo), cameraTimeout);
            await stage('Loading hand tracking', Promise.resolve().then(loadModel), modelTimeout);
            if (id !== generation) throw new Error('Setup cancelled');
            rejectPending = null;
            return true;
        } catch (error) {
            if (id === generation) cancel();
            throw error;
        }
    }
    return { start, cancel };
}

export function canAdvanceAlignment({ now, shownAt, pinchSince, pinching }) {
    return pinching && pinchSince !== null && now - shownAt >= 4000 && now - pinchSince >= 250;
}

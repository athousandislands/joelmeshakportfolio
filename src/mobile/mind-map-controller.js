// Owns navigation across a deferred import and a live WebGL session.
export function createMapSession({ load, create, onLoading, onError }) {
    let generation = 0, active = false, runtime = null, count = 76;
    function leave() {
        active = false;
        generation++;
        runtime?.dispose();
        runtime = null;
    }
    async function enter(tileCount = count) {
        leave();
        active = true;
        count = tileCount;
        const id = generation;
        onLoading(count);
        try {
            const module = await load();
            if (!active || id !== generation) return;
            runtime = create(module, count);
            runtime.start();
        } catch (error) {
            if (!active || id !== generation) return;
            runtime?.dispose();
            runtime = null;
            onError(error);
        }
    }
    return { enter, leave, get active() { return active; }, get tileCount() { return count; } };
}

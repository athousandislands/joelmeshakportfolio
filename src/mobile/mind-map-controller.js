// Retain one scene for return visits; navigation pauses rendering, teardown
// releases resources. Import tickets prevent a late load mounting off-screen.
export function createMapSession({ load, create, onLoading, onResume = () => {}, onError }) {
    let generation = 0, version = 0, active = false, runtime = null, count = 55;
    let backgroundTask = null;
    function leave() {
        if (!active) return;
        active = false;
        generation++;
        runtime?.pause();
    }
    function dispose() {
        active = false;
        generation++;
        version++;
        runtime?.dispose();
        runtime = null;
        backgroundTask = null;
    }
    function prepare() {
        if (runtime || backgroundTask) return backgroundTask;
        const resourceVersion = version;
        backgroundTask = (async () => {
            try {
                const module = await load();
                if (resourceVersion !== version) return;
                const report = error => {
                    if (resourceVersion !== version) return;
                    const notify = active;
                    dispose();
                    if (notify) onError(error);
                };
                runtime = create(module, count, report);
                runtime.prepare();
                if (active) runtime.resume();
            } catch (error) {
                if (resourceVersion !== version) return;
                const notify = active;
                dispose();
                if (notify) onError(error);
            } finally {
                if (resourceVersion === version) backgroundTask = null;
            }
        })();
        return backgroundTask;
    }
    async function enter(tileCount = count) {
        if (backgroundTask && tileCount === count) {
            if (!active) { active = true; onLoading(count); }
            await backgroundTask;
            return;
        }
        if (runtime && tileCount === count) {
            if (active) return;
            active = true;
            try {
                onResume();
                runtime.resume();
            } catch (error) {
                dispose();
                onError(error);
            }
            return;
        }
        dispose();
        active = true;
        count = tileCount;
        const id = generation, resourceVersion = version;
        onLoading(count);
        function report(error) {
            if (resourceVersion !== version) return;
            const notify = active;
            dispose();
            if (notify) onError(error);
        }
        try {
            const module = await load();
            if (!active || id !== generation) return;
            runtime = create(module, count, report);
            runtime.start();
        } catch (error) {
            if (!active || id !== generation) return;
            report(error);
        }
    }
    return { enter, prepare, leave, dispose, get active() { return active; }, get tileCount() { return count; } };
}

/**
 * Defer work until the JS thread is idle. Prefer over deprecated
 * InteractionManager.runAfterInteractions (RN recommends requestIdleCallback).
 */
const g = globalThis as typeof globalThis & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function runWhenIdle(task: () => void): { cancel: () => void } {
  let cancelled = false;
  const run = () => {
    if (!cancelled) task();
  };

  const ric = g.requestIdleCallback;
  const cancelIdle = g.cancelIdleCallback;
  if (typeof ric   === "function" && typeof cancelIdle === "function") {
    const id = ric(() => run());
    return {
      cancel() {
        cancelled = true;
        cancelIdle(id);
      },
    };
  }

  const t = setTimeout(run, 0);
  return {
    cancel() {
      cancelled = true;
      clearTimeout(t);
    },
  };
}

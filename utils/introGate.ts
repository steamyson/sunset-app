/** Intro finishes after first-launch animation; setup waits so its entrance isn’t hidden under SunriseIntro. */
let introFinished = false;
const waiters: Array<() => void> = [];

export function markIntroFinished() {
  if (introFinished) return;
  introFinished = true;
  while (waiters.length) {
    const next = waiters.shift();
    next?.();
  }
}

const FALLBACK_MS = 10_000;

export function waitForIntroFinished(): Promise<void> {
  if (introFinished) return Promise.resolve();
  return Promise.race([
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, FALLBACK_MS)),
  ]);
}

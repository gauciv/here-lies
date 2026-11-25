/** Has this device seen the comic and the tutorial? (A per-viewer convenience only.) */
const KEY = 'herelies:onboarded';

export const isOnboarded = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return true; // without storage, don't trap anyone in the intro every visit
  }
};

export const markOnboarded = (): void => {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* fine: they'll simply see it again */
  }
};

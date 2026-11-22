import './index.css';

import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';
import { loadApi } from './api';
import { Standby } from './game/Standby';

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

/** Open the full game. "Enter" leaves a short note so it walks straight through the door. */
const open = (e: MouseEvent, walkIn: boolean) => {
  try {
    if (walkIn) window.localStorage.setItem('herelies:enter', String(Date.now()));
  } catch {
    /* without storage the game simply opens at the camp */
  }
  if (isLocalPreview()) {
    window.location.assign('game.html'); // no Reddit host locally
    return;
  }
  try {
    requestExpandedMode(e.nativeEvent, 'game');
  } catch (err) {
    console.error('could not open the game', err);
  }
};

/** The feed post: the standby room, with your guide to the day's room on a scroll. */
export const Splash = () => {
  const [init, setInit] = useState<InitResponse | null>(null);

  useEffect(() => {
    let alive = true;
    void loadApi()
      .then((api) => api.init())
      .then((res) => { if (alive) setInit(res); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return (
    <main className="splash app">
      <Standby
        compact
        day={init?.day ?? null}
        me={init?.me ?? null}
        busy={!init}
        onEnter={(e) => open(e, true)}
        onReview={(e) => open(e, false)}
      />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);

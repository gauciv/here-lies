import './index.css';

import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { isResultPost, type ResultPost } from '../shared/share';
import { ResultPostCard } from './game/ResultPost';
import type { InitResponse } from '../shared/api';
import { isLocalPreview, loadApi } from './api';
import { Standby } from './game/Standby';


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

/** A shared result post carries its card in postData; a daily post doesn't. */
const resultCard = (): ResultPost | null => {
  if (isLocalPreview() && window.location.search.includes('demo-result')) return DEMO_RESULT;
  try {
    return isResultPost(context.postData) ? context.postData : null;
  } catch {
    return null; // local preview has no Reddit context
  }
};

/** localhost only (splash.html?demo-result): what a shared result post looks like */
const DEMO_RESULT: ResultPost = {
  kind: 'result', day: 2, user: 'tallowwick', room: 'The Gilded Narrows', tier: 'Tricky',
  crossed: true, time: 134_000, percent: 18, title: 'Pioneer', total: 11, streak: 4,
};

/** The feed post: the standby room, or the game card of a shared result. */
export const Splash = () => {
  const card = resultCard();
  return card ? <ResultPostCard card={card} onPlay={(e) => open(e, false)} /> : <Camp />;
};

/** The daily post: the standby room, with your guide to the day's room on a scroll. */
const Camp = () => {
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

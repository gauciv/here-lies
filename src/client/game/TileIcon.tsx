import { useEffect, useRef } from 'react';
import atlasUrl from '../assets/dungeon.png';
import { FRAMES } from '../engine/atlas';
import { getSprites } from '../engine/sprites';

type Kind = 'number' | 'slab' | 'door';

let atlas: HTMLImageElement | null = null;
const loadAtlas = (): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (atlas?.complete) { resolve(atlas); return; }
    const img = new Image();
    img.onload = () => { atlas = img; resolve(img); };
    img.onerror = () => reject(new Error('atlas failed to load'));
    img.src = atlasUrl;
  });

/** Exactly what the thing looks like in the dungeon, cut from the game's own art. */
export const TileIcon = ({ kind, scale = 2 }: { kind: Kind; scale?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = kind === 'door' ? 32 : 16;
  const h = kind === 'door' ? 32 : 16;

  useEffect(() => {
    let alive = true;
    void loadAtlas().then((img) => {
      const cv = ref.current;
      const x = cv?.getContext('2d');
      if (!alive || !cv || !x) return;
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, w, h);
      const tile = (name: keyof typeof FRAMES, dx: number, dy: number) => {
        const [sx, sy, fw, fh] = FRAMES[name];
        x.drawImage(img, sx, sy, fw, fh, dx, dy, fw, fh);
      };
      const sp = getSprites();
      if (kind === 'door') { tile('doors_leaf_closed', 0, 0); return; }
      tile('floor_1', 0, 0);
      if (kind === 'number') {
        // the number as it's drawn on the stones: warm digit with an ink outline
        const dark = sp.digit(2, 'ink').canvas;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] as const) x.drawImage(dark, 6 + ox, 5 + oy);
        x.drawImage(sp.digit(2, 'bone3').canvas, 6, 5);
        return;
      }
      x.drawImage(sp.slab.canvas, 2, 2);
      x.drawImage(sp.arrow(1, 'pst1').canvas, 4, 4);
    });
    return () => { alive = false; };
  }, [kind, w, h]);

  return <canvas ref={ref} width={w} height={h} className="tile-icon" style={{ width: w * scale, height: h * scale }} aria-hidden="true" />;
};

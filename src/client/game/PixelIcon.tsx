import type { ReactNode } from 'react';
import { C, type ColorKey } from '../engine/palette';

type Props = { rows: readonly string[]; legend: Record<string, ColorKey>; size?: number; title?: string };

/** Crisp SVG pixel art for UI chrome (candles, skulls) outside the canvas. */
export const PixelIcon = ({ rows, legend, size = 2, title }: Props) => {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const k = legend[ch];
      if (k) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={C[k]} />);
    })
  );
  return (
    <svg
      width={w * size}
      height={h * size}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {rects}
    </svg>
  );
};

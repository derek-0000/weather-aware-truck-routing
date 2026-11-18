import { cn } from "cn";
import { useEffect, useRef } from "react";

const TILE_PX = 12;
const ENTER_MS = 120;
const ENTER_SPREAD_MS = 420;
const EXIT_MS = 140;
const EXIT_SPREAD_MS = 480;
const REDUCED_ENTER_MS = 200;
const REDUCED_EXIT_MS = 250;
const IDLE_TINT = 0.035;
const PEAK_TINT = 0.16;
const COVER_LEVELS = 16;
const TINT_LEVELS = 32;

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const samples = 256;
  const table = new Float32Array(samples + 1);
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  let t = 0;
  for (let i = 0; i <= samples; i++) {
    while (t < 1 && bx(t) < i / samples) t += 1 / 4096;
    table[i] = by(Math.min(1, t));
  }
  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    const position = progress * samples;
    const index = Math.floor(position);
    return table[index] + (table[index + 1] - table[index]) * (position - index);
  };
}

const easeOut = cubicBezier(0.23, 1, 0.32, 1);

type PixelGrid = { cover: () => void; dissolve: () => void; destroy: () => void };

function createPixelGrid(canvas: HTMLCanvasElement, onExited: () => void): PixelGrid {
  const context = canvas.getContext("2d");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let count = 0;
  let rectX = new Float32Array(0);
  let rectY = new Float32Array(0);
  let rectW = new Float32Array(0);
  let rectH = new Float32Array(0);
  let tint = new Float32Array(0);
  let tintTarget = new Float32Array(0);
  let tintNext = new Float64Array(0);
  let stagger = new Float32Array(0);
  let coverFrom = new Float32Array(0);
  let coverTo = new Float32Array(0);
  let coverStart = new Float64Array(0);
  let coverLevel = new Uint8Array(0);
  let tintLevel = new Uint8Array(0);
  let order = new Uint32Array(0);
  let coverDuration = ENTER_MS;

  let mode: "cover" | "dissolve" = "cover";
  let exitAt = Infinity;
  let frame = 0;
  let last = performance.now();
  let tileColor = "#000";
  let tintColor = "#fff";

  function readColors() {
    const style = getComputedStyle(canvas);
    tileColor = style.getPropertyValue("--card").trim() || tileColor;
    tintColor = style.color || tintColor;
  }

  function coverAt(index: number, now: number) {
    const progress = (now - coverStart[index]) / coverDuration;
    if (progress <= 0) return coverFrom[index];
    if (progress >= 1) return coverTo[index];
    return coverFrom[index] + (coverTo[index] - coverFrom[index]) * easeOut(progress);
  }

  function tweenCover(to: number, now: number) {
    const reduced = reducedMotion.matches;
    const entering = to === 1;
    const duration = reduced
      ? entering ? REDUCED_ENTER_MS : REDUCED_EXIT_MS
      : entering ? ENTER_MS : EXIT_MS;
    const spread = reduced ? 0 : entering ? ENTER_SPREAD_MS : EXIT_SPREAD_MS;
    for (let index = 0; index < count; index++) {
      coverFrom[index] = coverAt(index, now);
      coverTo[index] = to;
      coverStart[index] = now + stagger[index] * spread;
    }
    coverDuration = duration;
    return now + spread + duration;
  }

  function build() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (!nextWidth || !nextHeight) return;
    if (count && nextWidth === width && nextHeight === height) return;
    const firstBuild = count === 0;
    width = nextWidth;
    height = nextHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const cols = Math.max(1, Math.round(width / TILE_PX));
    const rows = Math.max(1, Math.round(height / TILE_PX));
    count = cols * rows;
    rectX = new Float32Array(count);
    rectY = new Float32Array(count);
    rectW = new Float32Array(count);
    rectH = new Float32Array(count);
    tint = new Float32Array(count);
    tintTarget = new Float32Array(count);
    tintNext = new Float64Array(count);
    stagger = new Float32Array(count);
    coverFrom = new Float32Array(count);
    coverTo = new Float32Array(count);
    coverStart = new Float64Array(count);
    coverLevel = new Uint8Array(count);
    tintLevel = new Uint8Array(count);
    order = new Uint32Array(count);

    const snap = (value: number) => Math.round(value * dpr) / dpr;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const x0 = snap((col * width) / cols);
        const x1 = snap(((col + 1) * width) / cols);
        const y0 = snap((row * height) / rows);
        const y1 = snap(((row + 1) * height) / rows);
        rectX[index] = x0;
        rectY[index] = y0;
        rectW[index] = x1 - x0;
        rectH[index] = y1 - y0;
        tint[index] = tintTarget[index] = Math.random() * 0.25;
        const radial =
          Math.hypot((col + 0.5) / cols - 0.5, (row + 0.5) / rows - 0.5) / Math.SQRT1_2;
        stagger[index] = Math.random() * 0.6 + radial * 0.4;
      }
    }

    const now = performance.now();
    if (firstBuild && mode === "cover") {
      tweenCover(1, now);
    } else {
      coverFrom.fill(mode === "cover" ? 1 : 0);
      coverTo.fill(mode === "cover" ? 1 : 0);
    }
  }

  function fillByLevel(levels: Uint8Array, levelCount: number, color: string, alphaOf: (level: number) => number) {
    if (!context) return;
    const counts = new Uint32Array(levelCount);
    for (let index = 0; index < count; index++) counts[levels[index]]++;
    const starts = new Uint32Array(levelCount);
    for (let level = 1; level < levelCount; level++) starts[level] = starts[level - 1] + counts[level - 1];
    const cursor = starts.slice();
    for (let index = 0; index < count; index++) order[cursor[levels[index]]++] = index;
    context.fillStyle = color;
    for (let level = 1; level < levelCount; level++) {
      if (!counts[level]) continue;
      context.globalAlpha = alphaOf(level);
      context.beginPath();
      for (let j = starts[level]; j < starts[level] + counts[level]; j++) {
        const index = order[j];
        context.rect(rectX[index], rectY[index], rectW[index], rectH[index]);
      }
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function draw(now: number) {
    frame = requestAnimationFrame(draw);
    if (!context || !count) return;
    if (mode === "dissolve" && now >= exitAt) {
      cancelAnimationFrame(frame);
      frame = 0;
      context.clearRect(0, 0, canvas.width, canvas.height);
      onExited();
      return;
    }
    const dt = Math.min(64, now - last);
    last = now;
    const blend = 1 - Math.exp(-dt / (reducedMotion.matches ? 400 : 150));

    for (let index = 0; index < count; index++) {
      if (now >= tintNext[index]) {
        tintTarget[index] = Math.random() < 0.2 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.25;
        tintNext[index] = now + 300 + Math.random() * 1700;
      }
      tint[index] += (tintTarget[index] - tint[index]) * blend;
      const cover = coverAt(index, now);
      coverLevel[index] = Math.round(cover * (COVER_LEVELS - 1));
      const alpha = (IDLE_TINT + (PEAK_TINT - IDLE_TINT) * tint[index]) * cover;
      tintLevel[index] = Math.round((alpha / PEAK_TINT) * (TINT_LEVELS - 1));
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    fillByLevel(coverLevel, COVER_LEVELS, tileColor, (level) => level / (COVER_LEVELS - 1));
    fillByLevel(tintLevel, TINT_LEVELS, tintColor, (level) => (level / (TINT_LEVELS - 1)) * PEAK_TINT);
  }

  function start() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(draw);
  }

  const observer = new ResizeObserver(build);
  observer.observe(canvas);
  readColors();
  build();
  start();

  return {
    cover() {
      mode = "cover";
      exitAt = Infinity;
      readColors();
      if (count) tweenCover(1, performance.now());
      start();
    },
    dissolve() {
      mode = "dissolve";
      if (!count) {
        onExited();
        return;
      }
      exitAt = tweenCover(0, performance.now()) + 32;
      start();
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
    },
  };
}

/**
 * A grid of opaque tiles that fades in tile by tile, shimmers while `active`,
 * then dissolves to reveal what's underneath and calls `onExited`.
 */
export function PixelGridLoader({
  active,
  onExited,
  className,
}: {
  active: boolean;
  onExited: () => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<PixelGrid | null>(null);
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const grid = createPixelGrid(canvas, () => onExitedRef.current());
    gridRef.current = grid;
    return () => {
      grid.destroy();
      gridRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active) gridRef.current?.cover();
    else gridRef.current?.dissolve();
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full text-foreground", className)}
    />
  );
}

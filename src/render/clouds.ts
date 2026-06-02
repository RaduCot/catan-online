import { parseHexRgb } from "../utils/color";

export type CloudOpts = {
  enabled: boolean;
  color: string;
  opacity: number;
  density: number;
  scale: number;
  windSpeed: number;
  windDrift: number;
  morphSpeed: number;
  blend: GlobalCompositeOperation;
};

export type CloudState = {
  texA: HTMLCanvasElement | null;
  texB: HTMLCanvasElement | null;
  cacheKey: string;
  windAngle: number;
  windOffsetX: number;
  windOffsetY: number;
  windOffsetX2: number;
  windOffsetY2: number;
  morphPhase: number;
  lastT: number;
};

export const cloudState: CloudState = {
  texA: null, texB: null, cacheKey: "",
  windAngle: 0, windOffsetX: 0, windOffsetY: 0, windOffsetX2: 0, windOffsetY2: 0,
  morphPhase: 0, lastT: 0,
};

// Tileable multi-octave value-noise cloud texture (white pixels with alpha).
// Two textures are built and cross-faded each frame to give a morphing feel.
export function buildCloudTexture(N: number, seed: number, density: number, color: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const cctx = c.getContext("2d")!;
  const id = cctx.createImageData(N, N);
  const sizes = [8, 16, 32];
  const weights = [0.55, 0.3, 0.15];
  const grids = sizes.map((sz, i) => {
    let s = (seed * 2654435761 + i * 0x9e3779b1) >>> 0;
    const g = new Float32Array(sz * sz);
    for (let k = 0; k < g.length; k++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      g[k] = ((s >>> 8) & 0xffffff) / 0xffffff;
    }
    return g;
  });
  const sampleGrid = (grid: Float32Array, sz: number, x: number, y: number) => {
    const fx = (x / N) * sz;
    const fy = (y / N) * sz;
    const x0 = ((Math.floor(fx) % sz) + sz) % sz;
    const y0 = ((Math.floor(fy) % sz) + sz) % sz;
    const x1 = (x0 + 1) % sz;
    const y1 = (y0 + 1) % sz;
    const sx = fx - Math.floor(fx);
    const sy = fy - Math.floor(fy);
    const u = sx * sx * (3 - 2 * sx);
    const v = sy * sy * (3 - 2 * sy);
    const a = grid[y0 * sz + x0], b = grid[y0 * sz + x1];
    const cc = grid[y1 * sz + x0], d = grid[y1 * sz + x1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + cc * (1 - u) * v + d * u * v;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let n = 0;
      for (let i = 0; i < sizes.length; i++) n += weights[i] * sampleGrid(grids[i], sizes[i], x, y);
      const alpha = n > density ? Math.min(1, (n - density) / (1 - density)) : 0;
      const idx = (y * N + x) * 4;
      id.data[idx] = color[0];
      id.data[idx + 1] = color[1];
      id.data[idx + 2] = color[2];
      id.data[idx + 3] = Math.round(alpha * 255);
    }
  }
  cctx.putImageData(id, 0, 0);
  return c;
}

export function ensureCloudTextures(opts: CloudOpts) {
  const rgb = parseHexRgb(opts.color);
  const key = `${opts.density.toFixed(3)}|${rgb.join(",")}`;
  if (key === cloudState.cacheKey && cloudState.texA && cloudState.texB) return;
  cloudState.texA = buildCloudTexture(256, 1, opts.density, rgb);
  cloudState.texB = buildCloudTexture(256, 99173, opts.density, rgb);
  cloudState.cacheKey = key;
}

export function updateCloudWind(opts: CloudOpts, now: number) {
  const dt = cloudState.lastT === 0 ? 0 : Math.min(0.1, (now - cloudState.lastT) / 1000);
  cloudState.lastT = now;
  // Wind angle drifts slowly; speed is along that angle. Second layer drifts
  // ~30° off for a subtle morphing/eddying feel.
  cloudState.windAngle += opts.windDrift * dt;
  cloudState.windOffsetX += Math.cos(cloudState.windAngle) * opts.windSpeed * dt;
  cloudState.windOffsetY += Math.sin(cloudState.windAngle) * opts.windSpeed * dt;
  cloudState.windOffsetX2 += Math.cos(cloudState.windAngle + 0.5) * opts.windSpeed * 0.6 * dt;
  cloudState.windOffsetY2 += Math.sin(cloudState.windAngle + 0.5) * opts.windSpeed * 0.6 * dt;
  cloudState.morphPhase += opts.morphSpeed * dt;
}

export function drawClouds(ctx: CanvasRenderingContext2D, opts: CloudOpts) {
  if (!opts.enabled || !cloudState.texA || !cloudState.texB) return;
  // The current ctx transform = view (pan/zoom) applied. We want clouds anchored
  // to the world, so we keep that transform and fill the visible world rect.
  const t = ctx.getTransform();
  const inv = t.inverse();
  const tl = inv.transformPoint(new DOMPoint(0, 0));
  const br = inv.transformPoint(new DOMPoint(ctx.canvas.width, ctx.canvas.height));
  const rectX = Math.min(tl.x, br.x);
  const rectY = Math.min(tl.y, br.y);
  const rectW = Math.abs(br.x - tl.x);
  const rectH = Math.abs(br.y - tl.y);

  const m = 0.5 + 0.5 * Math.sin(cloudState.morphPhase);
  const draw = (tex: HTMLCanvasElement, alpha: number, ox: number, oy: number) => {
    if (alpha <= 0) return;
    const pattern = ctx.createPattern(tex, "repeat");
    if (!pattern) return;
    pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(opts.scale / 256));
    ctx.save();
    ctx.globalCompositeOperation = opts.blend;
    ctx.globalAlpha = opts.opacity * alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(rectX, rectY, rectW, rectH);
    ctx.restore();
  };
  draw(cloudState.texA, 1 - m, cloudState.windOffsetX, cloudState.windOffsetY);
  draw(cloudState.texB, m, cloudState.windOffsetX2, cloudState.windOffsetY2);
}

import { Board, generateBoard, TILE_TYPES, TileType } from "./board";
import { axialToPixel, hexBounds, HexLayout } from "./hex";

import clayUrl from "../assets/clay.png";
import desertUrl from "../assets/desert.png";
import forestUrl from "../assets/forest.png";
import mountainUrl from "../assets/mountain.png";
import sheepUrl from "../assets/sheep.png";
import wheatUrl from "../assets/wheat.png";

const TILE_URLS: Record<TileType, string> = {
  clay: clayUrl,
  desert: desertUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sheep: sheepUrl,
  wheat: wheatUrl,
};

async function loadImages(): Promise<Record<TileType, HTMLImageElement>> {
  const entries = await Promise.all(
    TILE_TYPES.map(
      (t) =>
        new Promise<[TileType, HTMLImageElement]>((res, rej) => {
          const img = new Image();
          img.onload = () => res([t, img]);
          img.onerror = rej;
          img.src = TILE_URLS[t];
        })
    )
  );
  return Object.fromEntries(entries) as Record<TileType, HTMLImageElement>;
}

function fitLayout(board: Board, canvasW: number, canvasH: number, padding = 40): HexLayout {
  // probe layout at size=1, then scale to fit canvas
  const probe: HexLayout = { size: 1, originX: 0, originY: 0 };
  const b = hexBounds(board.tiles, probe);
  const scale = Math.min(
    (canvasW - padding * 2) / b.width,
    (canvasH - padding * 2) / b.height
  );
  const size = scale;
  const real: HexLayout = { size, originX: 0, originY: 0 };
  const rb = hexBounds(board.tiles, real);
  const originX = (canvasW - rb.width) / 2 - rb.minX;
  const originY = (canvasH - rb.height) / 2 - rb.minY;
  return { size, originX, originY };
}

function draw(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: HexLayout,
  images: Record<TileType, HTMLImageElement>,
  imgScale: number
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  // flat-top hex: image bounding box = 2*size wide, sqrt(3)*size tall, then scale up
  const baseW = 2 * layout.size;
  const baseH = Math.sqrt(3) * layout.size;
  const drawW = baseW * imgScale;
  const drawH = baseH * imgScale;

  for (const tile of board.tiles) {
    const { x, y } = axialToPixel(tile, layout);
    const img = images[tile.type];
    ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
  }
}

async function main() {
  const canvas = document.getElementById("board") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const seedInput = document.getElementById("seed") as HTMLInputElement;
  const radiusInput = document.getElementById("radius") as HTMLInputElement;
  const imgScaleInput = document.getElementById("imgScale") as HTMLInputElement;
  const regenBtn = document.getElementById("regen") as HTMLButtonElement;

  const images = await loadImages();

  let board = generateBoard(Number(seedInput.value) || 0, Number(radiusInput.value) || undefined);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function render() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const layout = fitLayout(board, cssW, cssH);
    const imgScale = Number(imgScaleInput.value) || 1;
    draw(ctx, board, layout, images, imgScale);
  }

  function regen() {
    board = generateBoard(
      Number(seedInput.value) || 0,
      Number(radiusInput.value) || undefined
    );
    render();
  }

  regenBtn.addEventListener("click", regen);
  seedInput.addEventListener("change", regen);
  radiusInput.addEventListener("change", regen);
  imgScaleInput.addEventListener("input", render);
  window.addEventListener("resize", resize);

  resize();
  console.log(`board: seed=${board.seed} radius=${board.radius} tiles=${board.tiles.length}`);
}

main();

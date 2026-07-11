import Phaser from 'phaser';
import { Tile } from '@org/common';
import type { TileMap } from '@org/common';

const EPS = 0.0001;
const DARKNESS = 0.78;
const FADE_START = 0.62; // radius fraction where the gradient begins
const VIGNETTE_KEY = '__shadow_vignette';

function castDDA(
  px: number, py: number,
  cos: number, sin: number,
  map: TileMap,
  maxDist: number,
): { x: number; y: number } {
  const ts = map.tileSize;
  let col = Math.floor(px / ts);
  let row = Math.floor(py / ts);

  const stepCol = cos >= 0 ? 1 : -1;
  const stepRow = sin >= 0 ? 1 : -1;

  const tDeltaX = cos !== 0 ? Math.abs(ts / cos) : Infinity;
  const tDeltaY = sin !== 0 ? Math.abs(ts / sin) : Infinity;

  let tMaxX: number;
  if (cos > 0) tMaxX = ((col + 1) * ts - px) / cos;
  else if (cos < 0) tMaxX = (col * ts - px) / cos;
  else tMaxX = Infinity;

  let tMaxY: number;
  if (sin > 0) tMaxY = ((row + 1) * ts - py) / sin;
  else if (sin < 0) tMaxY = (row * ts - py) / sin;
  else tMaxY = Infinity;

  let t = 0;
  while (true) {
    if (tMaxX < tMaxY) {
      t = tMaxX; tMaxX += tDeltaX; col += stepCol;
    } else {
      t = tMaxY; tMaxY += tDeltaY; row += stepRow;
    }
    if (t >= maxDist) { t = maxDist; break; }
    if (col < 0 || col >= map.width || row < 0 || row >= map.height) { t = Math.min(t, maxDist); break; }
    if (map.tiles[row][col] === Tile.Wall) break;
  }

  const d = Math.min(t, maxDist);
  return { x: px + cos * d, y: py + sin * d };
}

function buildVisibilityPolygon(
  px: number, py: number,
  map: TileMap,
  radius: number,
): { x: number; y: number }[] {
  const ts = map.tileSize;
  const angles: number[] = [];

  // Uniformly-spread base rays give a smooth circular boundary where no walls obstruct.
  // ~4 px arc per ray segment is enough at the viewport zoom of 2.2×.
  const baseCount = Math.ceil((Math.PI * 2 * radius) / 4);
  for (let i = 0; i < baseCount; i++) {
    angles.push(((i / baseCount) * 2 - 1) * Math.PI);
  }

  // Precision rays toward wall tile corners — produces sharp shadow edges.
  const c0 = Math.max(0, Math.floor((px - radius) / ts));
  const c1 = Math.min(map.width - 1, Math.ceil((px + radius) / ts));
  const r0 = Math.max(0, Math.floor((py - radius) / ts));
  const r1 = Math.min(map.height - 1, Math.ceil((py + radius) / ts));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (map.tiles[r][c] !== Tile.Wall) continue;
      const corners: [number, number][] = [
        [c * ts,       r * ts      ],
        [(c + 1) * ts, r * ts      ],
        [c * ts,       (r + 1) * ts],
        [(c + 1) * ts, (r + 1) * ts],
      ];
      for (const [cx, cy] of corners) {
        const a = Math.atan2(cy - py, cx - px);
        angles.push(a - EPS, a, a + EPS);
      }
    }
  }

  angles.sort((a, b) => a - b);

  return angles.map((a) => castDDA(px, py, Math.cos(a), Math.sin(a), map, radius));
}

function buildVignetteTexture(scene: Phaser.Scene, radius: number): void {
  const size = radius * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Radial gradient: transparent from center to FADE_START, then ramps to full darkness at radius.
  const grad = ctx.createRadialGradient(radius, radius, radius * FADE_START, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${DARKNESS})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Clip to circle — corners of the canvas would otherwise stay at DARKNESS and create
  // a visible dark square when composited on top of the RT.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (scene.textures.exists(VIGNETTE_KEY)) scene.textures.remove(VIGNETTE_KEY);
  scene.textures.addCanvas(VIGNETTE_KEY, canvas);
}

export class ShadowLayer {
  private scene: Phaser.Scene;
  private rt: Phaser.GameObjects.RenderTexture;
  private gLocal: Phaser.GameObjects.Graphics;
  private gOthers: Phaser.GameObjects.Graphics;
  private gradImg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, mapW: number, mapH: number, radius = 400) {
    this.scene = scene;
    // 'all' mode: re-executes the command buffer every frame AND displays the result.
    this.rt = scene.add.renderTexture(0, 0, mapW, mapH)
      .setOrigin(0, 0).setDepth(20).setRenderMode('all');
    // Two separate Graphics objects so the RT command buffer always references
    // distinct objects — rt.erase() stores a reference, not a geometry snapshot,
    // so reusing one object causes all enqueued erases to replay with the final state.
    this.gLocal = scene.add.graphics().setVisible(false);
    this.gOthers = scene.add.graphics().setVisible(false);

    buildVignetteTexture(scene, radius);
    this.gradImg = scene.add.image(0, 0, VIGNETTE_KEY).setVisible(false);
  }

  update(
    localPos: { x: number; y: number },
    others: { x: number; y: number }[],
    map: TileMap,
    radius = 400,
  ) {
    // Build local player's polygon geometry.
    const localPoly = buildVisibilityPolygon(localPos.x, localPos.y, map, radius);
    this.gLocal.clear();
    this.gLocal.fillStyle(0xffffff, 1);
    this.gLocal.fillPoints(localPoly as Phaser.Math.Vector2[], true);

    // Build all other players' polygons into one Graphics object (multiple fillPoints
    // calls accumulate independently — each starts its own sub-path).
    this.gOthers.clear();
    if (others.length > 0) {
      this.gOthers.fillStyle(0xffffff, 1);
      for (const { x: px, y: py } of others) {
        const poly = buildVisibilityPolygon(px, py, map, radius);
        this.gOthers.fillPoints(poly as Phaser.Math.Vector2[], true);
      }
    }

    // Issue all RT commands now that both Graphics objects are in their final state.
    // The command buffer references these objects at flush time, so geometry must be
    // fully written before any rt.* call is made.
    this.rt.clear();
    this.rt.fill(0x000000, DARKNESS);

    // Erase the union of all visible areas.
    if (others.length > 0) this.rt.erase(this.gOthers, 0, 0);
    this.rt.erase(this.gLocal, 0, 0);

    // Soft gradient for the local player's radius edge.
    this.gradImg.setPosition(localPos.x, localPos.y);
    this.rt.draw(this.gradImg, 0, 0);

    // Re-erase others so the gradient doesn't darken their lit zones.
    if (others.length > 0) this.rt.erase(this.gOthers, 0, 0);
  }

  resize(mapW: number, mapH: number) {
    this.rt.resize(mapW, mapH);
  }

  destroy() {
    this.rt.destroy();
    this.gLocal.destroy();
    this.gOthers.destroy();
    this.gradImg.destroy();
    if (this.scene.textures.exists(VIGNETTE_KEY)) {
      this.scene.textures.remove(VIGNETTE_KEY);
    }
  }
}

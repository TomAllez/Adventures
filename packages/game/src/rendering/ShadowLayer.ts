import Phaser from 'phaser';
import { Tile } from '@org/common';
import type { TileMap } from '@org/common';

const EPS = 0.0001;
const DARKNESS = 0.78;
const FADE_START = 0.55; // radius fraction at which the gradient begins
const POLY_TEX_KEY = '__shadow_local_poly';

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

  const baseCount = Math.ceil((Math.PI * 2 * radius) / 4);
  for (let i = 0; i < baseCount; i++) {
    angles.push(((i / baseCount) * 2 - 1) * Math.PI);
  }

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

export class ShadowLayer {
  private scene: Phaser.Scene;
  private rt: Phaser.GameObjects.RenderTexture;
  private gOthers: Phaser.GameObjects.Graphics;
  // Canvas texture for the local player's visibility polygon with a radial gradient fill.
  // Using destination-out erase with this texture produces a polygon-clipped soft fade —
  // no separate gradient circle is composited, so there's no circular boundary artifact.
  private polyTex: Phaser.Textures.CanvasTexture;
  private polyImg: Phaser.GameObjects.Image;
  private radius: number;

  constructor(scene: Phaser.Scene, mapW: number, mapH: number, radius = 400) {
    this.scene = scene;
    this.radius = radius;

    this.rt = scene.add.renderTexture(0, 0, mapW, mapH)
      .setOrigin(0, 0).setDepth(20).setRenderMode('all');

    this.gOthers = scene.add.graphics().setVisible(false);

    this.polyTex = scene.textures.createCanvas(POLY_TEX_KEY, radius * 2, radius * 2)!;
    this.polyImg = scene.add.image(0, 0, POLY_TEX_KEY).setVisible(false);
  }

  update(
    localPos: { x: number; y: number },
    others: { x: number; y: number }[],
    map: TileMap,
    radius = this.radius,
  ) {
    // Build local player's polygon and render it to the canvas texture with a
    // radial gradient (opaque at center → transparent at radius edge). Using
    // rt.erase() with this texture clips the soft fade to the polygon shape,
    // eliminating any circular boundary artifact.
    const localPoly = buildVisibilityPolygon(localPos.x, localPos.y, map, radius);
    this.renderLocalPolygon(localPos, localPoly, radius);
    this.polyImg.setPosition(localPos.x, localPos.y);

    // Build all other players' polygons into gOthers (accumulated with fillPoints).
    this.gOthers.clear();
    if (others.length > 0) {
      this.gOthers.fillStyle(0xffffff, 1);
      for (const { x: px, y: py } of others) {
        const poly = buildVisibilityPolygon(px, py, map, radius);
        this.gOthers.fillPoints(poly as Phaser.Math.Vector2[], true);
      }
    }

    // Issue RT commands after both geometry sources are fully written.
    this.rt.clear();
    this.rt.fill(0x000000, DARKNESS);

    // Erase other players' lit areas (hard-edged, full alpha).
    if (others.length > 0) this.rt.erase(this.gOthers, 0, 0);

    // Erase local player's lit area using the gradient-filled polygon canvas.
    // destination-out: result_alpha = dst_alpha × (1 − src_alpha).
    // Because the canvas is transparent outside the polygon, nothing outside it
    // is erased — so no circular boundary can form.
    this.rt.erase(this.polyImg, 0, 0);
  }

  private renderLocalPolygon(
    localPos: { x: number; y: number },
    polygon: { x: number; y: number }[],
    radius: number,
  ): void {
    const ctx = this.polyTex.context;
    const size = radius * 2;
    ctx.clearRect(0, 0, size, size);

    if (polygon.length < 3) return;

    // Polygon vertices in canvas-local space: player is at (radius, radius).
    const ox = localPos.x - radius;
    const oy = localPos.y - radius;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x - ox, polygon[0].y - oy);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x - ox, polygon[i].y - oy);
    }
    ctx.closePath();

    // Radial gradient fill: opaque inside, transparent at radius.
    // When erased via destination-out, opaque pixels erase fully (bright center)
    // and the fade zone partially erases (soft edge), clipped exactly to the polygon.
    const grad = ctx.createRadialGradient(radius, radius, radius * FADE_START, radius, radius, radius);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    this.polyTex.refresh();
  }

  resize(mapW: number, mapH: number) {
    this.rt.resize(mapW, mapH);
  }

  destroy() {
    this.rt.destroy();
    this.gOthers.destroy();
    this.polyImg.destroy();
    if (this.scene.textures.exists(POLY_TEX_KEY)) {
      this.scene.textures.remove(POLY_TEX_KEY);
    }
  }
}

import Phaser from 'phaser';
import { Tile } from '@org/common';
import type { TileMap, TilesetMeta, TileSprite } from '@org/common';
import { EditorScene } from './scenes/EditorScene.js';

const SIDEBAR_WIDTH = 284;
const TOOLBAR_HEIGHT = 52;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth - SIDEBAR_WIDTH,
  height: window.innerHeight - TOOLBAR_HEIGHT,
  backgroundColor: '#0f0f1e',
  parent: 'canvas-container',
  scene: [EditorScene],
});

function getEditor(): EditorScene {
  return game.scene.getScene('EditorScene') as EditorScene;
}

// Per-tileset reset callbacks — called to clear selection without losing the grid overlay
const tilesetResetFns = new Map<string, () => void>();

function clearTilesetSelection() {
  for (const reset of tilesetResetFns.values()) reset();
  getEditor().setSelectedTileSprite(null);
  // Deactivate the toolbar tile buttons so neither Wall nor Floor looks selected
  document.querySelectorAll('[data-tile]').forEach((b) => b.classList.remove('active'));
}

// --- Tileset panel rendering ---

function renderTilesetPanel(meta: TilesetMeta): void {
  const panel = document.getElementById('tileset-panel')!;

  const wrapper = document.createElement('div');
  wrapper.className = 'tileset-entry';
  wrapper.dataset.tilesetId = meta.id;

  const nameEl = document.createElement('div');
  nameEl.className = 'tileset-name';
  nameEl.textContent = `${meta.name}  (${meta.tileWidth}×${meta.tileHeight}px)`;
  wrapper.appendChild(nameEl);

  // Set onload BEFORE src to avoid missing the event on cached images
  const img = new Image();
  img.onload = () => {
    const displayWidth = SIDEBAR_WIDTH - 24;
    const scale = Math.min(1, displayWidth / img.width);

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    canvas.style.cursor = 'crosshair';
    canvas.style.imageRendering = 'pixelated';
    // Prevent CSS stretching — display at natural (scaled) size
    canvas.style.maxWidth = '100%';
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d')!;
    const tw = meta.tileWidth * scale;
    const th = meta.tileHeight * scale;
    let selCol = -1;
    let selRow = -1;

    function redraw() {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Grid overlay
      ctx.strokeStyle = 'rgba(255,255,80,0.4)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= canvas.width + 0.5; x += tw) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= canvas.height + 0.5; y += th) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Selection highlight
      if (selCol >= 0) {
        ctx.fillStyle = 'rgba(0,170,255,0.3)';
        ctx.fillRect(selCol * tw, selRow * th, tw, th);
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(selCol * tw + 0.75, selRow * th + 0.75, tw - 1.5, th - 1.5);
      }
    }

    // Register a reset fn so other canvases can clear their highlight via redraw()
    tilesetResetFns.set(meta.id, () => {
      selCol = -1;
      selRow = -1;
      redraw();
    });

    redraw();

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      // Map from CSS display coordinates to canvas pixel coordinates,
      // then to tile grid indices — needed because CSS may scale the element
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const canvasX = cssX * (canvas.width / rect.width);
      const canvasY = cssY * (canvas.height / rect.height);
      selCol = Math.floor(canvasX / tw);
      selRow = Math.floor(canvasY / th);

      // Reset other tilesets' selections via their stored closures (preserves grid)
      for (const [id, reset] of tilesetResetFns) {
        if (id !== meta.id) reset();
      }

      redraw();

      const sprite: TileSprite = { tilesetId: meta.id, col: selCol, row: selRow };
      getEditor().setSelectedTileSprite(sprite);
      // Deactivate Wall/Floor toolbar buttons while a tileset tile is active
      document.querySelectorAll('[data-tile]').forEach((b) => b.classList.remove('active'));
    });

    wrapper.appendChild(canvas);
  };
  img.src = `/api/tilesets/${meta.id}`;

  panel.appendChild(wrapper);
}

// --- Event wiring ---

game.events.on('ready', () => {
  // Render HTML panel for tilesets already saved in the map
  getEditor().mapLoadedCallback = (map: TileMap) => {
    for (const meta of map.tilesets) renderTilesetPanel(meta);
  };

  // Tile type selector (Wall / Floor) — also clears any active tileset sprite
  document.querySelectorAll<HTMLButtonElement>('[data-tile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clearTilesetSelection();
      btn.classList.add('active');
      getEditor().selectedTile = btn.dataset.tile === 'wall' ? Tile.Wall : Tile.Floor;
    });
  });

  // Save
  document.getElementById('btn-save')?.addEventListener('click', async () => {
    const status = document.getElementById('status')!;
    try {
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getEditor().getMap()),
      });
      if (!res.ok) throw new Error();
      status.textContent = 'Saved!';
      status.style.color = '#00ff88';
    } catch {
      status.textContent = 'Save failed';
      status.style.color = '#ff4455';
    }
    setTimeout(() => { status.textContent = ''; }, 2000);
  });

  // Clear
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (confirm('Clear all tiles and visual layer to floor?')) getEditor().clearMap();
  });

  // Deselect tileset tile — back to plain collision paint
  document.getElementById('btn-deselect-tile')?.addEventListener('click', () => {
    clearTilesetSelection();
    // Restore Wall as the default active tool
    document.querySelector<HTMLElement>('[data-tile="wall"]')?.classList.add('active');
    getEditor().selectedTile = Tile.Wall;
  });

  // Import tileset — open file picker
  document.getElementById('btn-import-tileset')?.addEventListener('click', () => {
    document.getElementById('tileset-file-input')?.click();
  });

  // File selected → prompt tile size → upload → load → render panel
  document.getElementById('tileset-file-input')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (e.target as HTMLInputElement).value = '';

    const tileW = parseInt(prompt(`Tile width in "${file.name}" (px)?`, '32') ?? '0');
    const tileH = parseInt(prompt(`Tile height in "${file.name}" (px)?`, '32') ?? '0');
    if (!tileW || !tileH || tileW < 1 || tileH < 1) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result as string;
      try {
        const res = await fetch('/api/tilesets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data, tileWidth: tileW, tileHeight: tileH }),
        });
        if (!res.ok) throw new Error('upload failed');
        const meta: TilesetMeta = await res.json();

        getEditor().getMap().tilesets.push(meta);
        await getEditor().loadTilesetFromServer(meta);
        renderTilesetPanel(meta);
      } catch {
        alert('Failed to import tileset. Is the server running?');
      }
    };
    reader.readAsDataURL(file);
  });
});

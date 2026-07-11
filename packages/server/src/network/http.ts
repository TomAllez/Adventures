import { createServer, type Server } from 'node:http';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TileMap } from '@org/common';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TILESETS_DIR = resolve(__dirname, '../../tilesets');

type MapHandlers = {
  getMap: () => TileMap;
  setMap: (map: TileMap) => Promise<void>;
};

export function createHttpServer(handlers: MapHandlers): Server {
  return createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    const url = req.url ?? '';

    // --- Map ---
    if (url === '/api/map') {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        res.writeHead(200).end(JSON.stringify(handlers.getMap()));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            await handlers.setMap(JSON.parse(body) as TileMap);
            res.writeHead(200).end('{}');
          } catch {
            res.writeHead(400).end('{"error":"invalid map"}');
          }
        });
        return;
      }
    }

    // --- Tileset upload ---
    if (url === '/api/tilesets' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { name, data, tileWidth, tileHeight } = JSON.parse(body) as {
            name: string; data: string; tileWidth: number; tileHeight: number;
          };
          const match = data.match(/^data:image\/(\w+);base64,(.+)$/s);
          if (!match) throw new Error('invalid data URL');
          const [, ext, base64] = match;
          const id = randomUUID();
          mkdirSync(TILESETS_DIR, { recursive: true });
          await writeFile(resolve(TILESETS_DIR, `${id}.${ext}`), Buffer.from(base64, 'base64'));
          res.writeHead(200).end(JSON.stringify({ id, name, tileWidth, tileHeight }));
        } catch {
          res.writeHead(400).end('{"error":"invalid tileset"}');
        }
      });
      return;
    }

    // --- Tileset serve ---
    if (url.startsWith('/api/tilesets/') && req.method === 'GET') {
      const id = url.slice('/api/tilesets/'.length);
      if (id && !id.includes('/')) {
        try {
          mkdirSync(TILESETS_DIR, { recursive: true });
          const file = readdirSync(TILESETS_DIR).find((f) => f.startsWith(`${id}.`));
          if (file) {
            const ext = file.split('.').pop() ?? 'png';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
            const fileData = readFileSync(resolve(TILESETS_DIR, file));
            res.writeHead(200, {
              'Content-Type': mime,
              'Cache-Control': 'public, max-age=31536000',
            }).end(fileData);
            return;
          }
        } catch { /* fall through to 404 */ }
      }
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(404).end('{"error":"not found"}');
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404).end('{"error":"not found"}');
  });
}

#!/usr/bin/env node
// A tiny static server for working on Hearth locally:  node tools/serve.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
export function serve(root = ROOT, port = 0) { return new Promise(resolve => { const s = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; } const data = fs.readFileSync(f), type = MIME[path.extname(f)] || 'application/octet-stream', m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) { const a = +m[1], b = m[2] ? +m[2] : data.length - 1; res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 }); res.end(data.subarray(a, b + 1)); }
    else { res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }); res.end(data); } });
  s.listen(port, '127.0.0.1', () => resolve({ server: s, url: `http://127.0.0.1:${s.address().port}/` })); }); }
if (process.argv[1] === fileURLToPath(import.meta.url)) serve(ROOT, +process.argv[2] || 8080).then(({ url }) => console.log('Hearth is at ' + url));

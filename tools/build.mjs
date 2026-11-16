#!/usr/bin/env node
// Builds dist/hearth.html: the whole app in one file (styles, scripts, data and the two NASA frames inlined).
// Three.js is the only thing left outside, loaded from cdnjs; if it cannot load, the app falls back to its 2D ring.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="src/hearth.css">', () => '<style>\n' + read('src/hearth.css') + '</style>');
html = html.replace(/<link rel="manifest"[^>]*>\n/, '').replace(/<link rel="icon"[^>]*>\n/, '');
html = html.replace('<script src="vendor/three.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>window.Hearth = window.Hearth || {}; window.Hearth.SINGLE = true;</script>');
html = html.replace(/<script src="(src\/[\w.\-]+\.js)"><\/script>/g, (m, f) => {
  let js = read(f);
  if (f.endsWith('frames.js')) js = js.replace(/src: '(assets\/frames\/[^']+)'/g, (mm, p) => `src: 'data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, p)).toString('base64')}'`).replace(/hi: '[^']+'/g, 'hi: null');
  return '<script>\n' + js.replace(/<\/script/gi, '<\\/script') + '</script>';
});
if (/<script src="src\//.test(html) || /href="src\//.test(html)) throw new Error('something was not inlined');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'dist/hearth.html'), html);
console.log(`dist/hearth.html  ${(html.length / 1024).toFixed(0)} KB`);

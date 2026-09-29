#!/usr/bin/env node
/* Inlines every local stylesheet and script referenced by index.html into one file.
   Usage:
     node tools/build-single.js                 → dist/midnight-airmail.html (full document)
     node tools/build-single.js --fragment OUT  → OUT without doctype/html/head/body wrappers
                                                   (for hosts that supply their own skeleton) */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fragIdx = args.indexOf('--fragment');
const fragment = fragIdx !== -1;
const out = fragment ? path.resolve(args[fragIdx + 1]) : path.join(root, 'dist', 'midnight-airmail.html');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

html = html.replace(/<link rel="stylesheet" href="((?!https?:)[^"]+)">/g, (_, href) =>
  '<style>\n' + read(href) + '\n</style>');

html = html.replace(/<script src="((?!https?:)[^"]+)"[^>]*><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(src + ' contains a closing script tag');
  return '<script>/* ' + src + ' */\n' + code + '\n</script>';
});

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
  // The title must come first so hosts that scan the head of the file find it.
  const title = html.match(/<title>[^<]*<\/title>/)[0];
  html = title + '\n' + html.replace(title, '');
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote ' + path.relative(root, out) + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');

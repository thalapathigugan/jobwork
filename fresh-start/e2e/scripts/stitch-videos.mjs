#!/usr/bin/env node
// FW.0: joins the full portal walk's recordings into one mp4 per portal and one for the
// whole run, in run order, each clip preceded by a two-second title card naming the
// chapter, the actor and the outcome. Reads the JSON report Playwright wrote
// (walk-results/results.json) and writes e2e/videos/. Needs ffmpeg on PATH; the cards are
// rendered with Playwright's browser, so no ffmpeg text filters are required.
//
//   node scripts/stitch-videos.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const e2e = join(here, '..');
const report = JSON.parse(readFileSync(join(e2e, 'walk-results', 'results.json'), 'utf8'));
const out = join(e2e, 'videos');
const work = join(out, '.work');
rmSync(out, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

/** Every test with a recording, in the order it ran. */
const clips = [];
const visit = (suite, file) => {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const r = t.results?.[0];
      const video = r?.attachments?.find((a) => a.name === 'video' && a.path && existsSync(a.path));
      if (video) clips.push({ title: spec.title, file: file ?? suite.file, status: r.status, start: Date.parse(r.startTime), duration: r.duration, path: video.path });
    }
  }
  for (const child of suite.suites ?? []) visit(child, file ?? suite.file);
};
for (const s of report.suites ?? []) visit(s, s.file);
clips.sort((a, b) => a.start - b.start);
if (clips.length === 0) throw new Error('no recordings in walk-results/results.json: run the walk first');

const portalOf = (title) => (title.startsWith('ops ·') ? 'operations' : title.startsWith('supplier ·') ? 'supplier' : title.startsWith('customer ·') ? 'customer' : 'public');
const ENCODE = ['-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-an'];
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const browser = await chromium.launch(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {});
const card = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [n, c] of clips.entries()) {
  const chapter = c.file.replace(/^.*\//, '').replace(/\.spec\.ts$/, '');
  const [who, ...rest] = c.title.split(' · ');
  const ok = c.status === 'passed';
  await card.setContent(`<body style="margin:0;height:800px;display:flex;flex-direction:column;justify-content:center;padding:0 96px;font-family:Helvetica,Arial,sans-serif;background:#0f172a;color:#f8fafc">
    <p style="font-size:22px;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;margin:0">JobWork full portal walk · ${esc(chapter)} · ${n + 1}/${clips.length}</p>
    <h1 style="font-size:54px;line-height:1.15;margin:28px 0">${esc(rest.join(' · ') || c.title)}</h1>
    <p style="font-size:28px;margin:0;color:#cbd5e1">${esc(who)} portal · <span style="color:${ok ? '#86efac' : '#fca5a5'}">${ok ? 'passed' : esc(c.status)}</span> · ${(c.duration / 1000).toFixed(1)} s</p></body>`);
  const png = join(work, `${String(n).padStart(3, '0')}-card.png`);
  await card.screenshot({ path: png });
  c.card = join(work, `${String(n).padStart(3, '0')}-card.mp4`);
  c.mp4 = join(work, `${String(n).padStart(3, '0')}-clip.mp4`);
  ffmpeg(['-loop', '1', '-t', '2', '-i', png, '-vf', 'scale=1280:800', ...ENCODE, c.card]);
  ffmpeg(['-i', c.path, '-vf', 'scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2', ...ENCODE, c.mp4]);
}
await browser.close();

const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim());
const stamp = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const index = ['# JobWork full portal walk — recordings', '', `${clips.length} chapters · ${clips.filter((c) => c.status === 'passed').length} passed`, ''];
const groups = [
  ['00-full-walk', clips],
  ['01-operations', clips.filter((c) => portalOf(c.title) === 'operations')],
  ['02-customer', clips.filter((c) => portalOf(c.title) === 'customer' || portalOf(c.title) === 'public')],
  ['03-supplier', clips.filter((c) => portalOf(c.title) === 'supplier')],
];
for (const [name, list] of groups) {
  if (list.length === 0) continue;
  const listFile = join(work, `${name}.txt`);
  writeFileSync(listFile, list.flatMap((c) => [`file '${c.card}'`, `file '${c.mp4}'`]).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', join(out, `${name}.mp4`)]);
  index.push(`## ${name}.mp4`, '', '| Start | Chapter | Result |', '|---|---|---|');
  let at = 0;
  for (const c of list) {
    index.push(`| ${stamp(at)} | ${c.title} | ${c.status} |`);
    at += seconds(c.card) + seconds(c.mp4);
  }
  index.push('');
}
writeFileSync(join(out, 'index.md'), index.join('\n'));
rmSync(work, { recursive: true, force: true });
console.log(`stitched ${clips.length} clips into ${groups.filter(([, l]) => l.length).length} videos in ${out}`);

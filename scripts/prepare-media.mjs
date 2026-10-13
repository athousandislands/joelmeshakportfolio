import { readdir, mkdir, writeFile, stat, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { FOLDER_PREVIEWS } from '../src/desktop/folder-previews.js';

const root = 'public';
const previewsOnly = process.argv.includes('--previews-only');
const manifest = { images: {}, videos: {} };
const previewRevision = (await stat('src/desktop/folder-previews.js')).mtimeMs;
const jobs = [];
function run(command, args) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        process.stdout.on('data', data => { out += data; });
        process.stderr.on('data', data => { err += data; });
        process.on('error', reject);
        process.on('close', code => code ? reject(new Error(err || `${command} failed`)) : resolve(out));
    });
}
async function files(directory) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await files(file));
        else result.push(file);
    }
    return result;
}
async function encode(source, target, options) {
    await mkdir(path.dirname(target), { recursive: true });
    try {
        const existing = await stat(target);
        const revision = Math.max((await stat(source)).mtimeMs, target.includes('/_previews/') ? previewRevision : 0);
        if (existing.size > 0 && existing.mtimeMs >= revision) return;
    } catch { /* Generate a missing or outdated rendition. */ }
    if (target.endsWith('.webp')) { await run('python3', ['scripts/encode-image.py', source, target]); return; }
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-i', source, ...options, '-threads', '1', target]);
}
const sources = previewsOnly ? [] : await files('public/assets/projects');
if (!previewsOnly) sources.push(...['1','2','3'].map(number => `public/assets/profilepic${number}.png`));
for (const source of sources) {
    const url = source.slice(root.length + 1);
    const stem = url.replace(/\.[^.]+$/, '');
    if (/\.(png|webp|jpe?g)$/i.test(source) && !source.includes('/mind-map/')) {
        const meta = JSON.parse(await run('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',source])).streams[0];
        manifest.images[url] = { w: meta.width, h: meta.height, v: [480,720,1080] };
        for (const width of [480,720,1080]) jobs.push(() => encode(source, `${root}/assets/_derived/${stem}-${width}.webp`, ['-vf',`scale='min(${width},iw)':-2:flags=lanczos`,'-c:v','libwebp','-quality','82','-compression_level','5']));
    }
    if (/\.(mp4|webm|mov)$/i.test(source)) {
        const mobile = `assets/_mobile/${stem}.mp4`, poster = `assets/_posters/${stem}.webp`;
        manifest.videos[url] = { mobile, poster };
        jobs.push(() => encode(source, `${root}/${poster}`, ['-vf',"select=eq(n\\,0),scale='min(720,iw)':-2",'-frames:v','1','-c:v','libwebp','-quality','80']));
        jobs.push(() => encode(source, `${root}/${mobile}`, ['-vf',"scale='min(720,iw)':-2:flags=lanczos",'-an','-c:v','libx264','-profile:v','main','-pix_fmt','yuv420p','-crf','24','-maxrate','1500k','-bufsize','2200k','-g','30','-keyint_min','30','-sc_threshold','0','-movflags','+faststart']));
    }
}
FOLDER_PREVIEWS.forEach((folder, index) => folder.forEach((source, card) => jobs.push(() => encode(`${root}/${source}`, `${root}/assets/_previews/${index}-${card}.webp`, ['-vf','scale=384:494:force_original_aspect_ratio=increase,crop=384:494','-c:v','libwebp','-quality','85']))));
let next = 0, completed = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < jobs.length) {
        const job = jobs[next++];
        await job();
        completed++;
        if (completed % 30 === 0 || completed === jobs.length) console.log(`Media prepared: ${completed}/${jobs.length}`);
    }
}));
if (!previewsOnly) {
await mkdir('public/assets/vendor/basis', { recursive: true });
for (const name of ['basis_transcoder.js','basis_transcoder.wasm']) await copyFile(`node_modules/three/examples/jsm/libs/basis/${name}`, `public/assets/vendor/basis/${name}`);
// A manifest is written only after all outputs succeed, so code never points at half a build.
await writeFile('src/shared/media-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}
console.log(previewsOnly ? 'Folder previews are ready.' : 'Image variants, video renditions, folder previews and local transcoder are ready.');

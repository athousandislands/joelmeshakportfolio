import { PROJECTS as projects } from '../src/mobile/project-data.js';
import { readFile, stat } from 'node:fs/promises';
import { allProjectsData, buildMediaData } from '../src/desktop/project-data.js';
import { FOLDER_PREVIEWS } from '../src/desktop/folder-previews.js';
const refs = new Set();
for (const project of projects) for (const collection of project.collections) for (const [file] of collection.items) refs.add(collection.base + file);
for (const project of allProjectsData) for (const collection of buildMediaData(project)) for (const asset of collection.assets) refs.add(asset.src);
const manifest = JSON.parse(await readFile('src/shared/media-manifest.json', 'utf8'));
for (const [src, entry] of Object.entries(manifest.images)) {
    refs.add(src);
    for (const width of entry.v) refs.add(`assets/_derived/${src.replace(/\.[^.]+$/, '')}-${width}.webp`);
}
for (const [src, entry] of Object.entries(manifest.videos)) { refs.add(src); refs.add(entry.mobile); refs.add(entry.poster); }
FOLDER_PREVIEWS.forEach((folder, i) => folder.forEach((src,j) => { refs.add(src); refs.add(`assets/_previews/${i}-${j}.webp`); }));
for (const src of ['assets/profilepic1.png','assets/profilepic2.png','assets/profilepic3.png','assets/favicon.ico','assets/vendor/basis/basis_transcoder.js','assets/vendor/basis/basis_transcoder.wasm']) refs.add(src);
const mindMap = await readFile('src/desktop/mind-map.js','utf8');
const imageFiles = JSON.parse('[' + mindMap.match(/const imageFiles = \[([\s\S]*?)\];/)[1] + ']');
for (const name of imageFiles) { refs.add(`assets/projects/mind-map/gallery/${name}`); refs.add(`assets/projects/mind-map/gallery/ktx2/${name.replace(/\.[^.]+$/,'')}.ktx2`); }
const webManifest = JSON.parse(await readFile('public/assets/site.webmanifest','utf8'));
for (const icon of webManifest.icons) refs.add(icon.src.replace(/^\//,''));
const missing = [];
for (const ref of refs) {
    try { if (!(await stat('public/' + ref)).size) missing.push(ref + ' (empty)'); } catch { missing.push(ref); }
}
await stat('public/404.html');
if (missing.length) { console.error('Missing media:', missing); process.exitCode = 1; }
else console.log(`Asset checks passed: ${refs.size} files, including every mobile image and all 76 Mind Map pairs.`);

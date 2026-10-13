# Joel Meshak portfolio

The existing portfolio, organized for local development and a reproducible static build. The creative direction, separate mobile/desktop experiences, shaders and interactions are retained.

## Everyday workflow

Ask Codex to start the portfolio, test a change, or prepare a commit. Deployment and approved GitHub pushes are separate actions; running locally publishes nothing.

- `npm install`: install the pinned application dependencies and build tools.
- `npm run dev`: start the local website at http://127.0.0.1:5173.
- `npm test`: check camera cancellation, loading failures, tutorial timing, Save-Data preparation and rendering quality timing.
- `npm run check:assets`: check the original media, generated variants and manifest paths.
- `npm run build`: produce the static production website in `dist/`.
- `npm run preview`: serve that production build locally for review.

Use Node.js 24 (or 22.12+). The lockfile records exact versions. Three.js 0.160.0 and GSAP 3.12.2 match the original implementation. MediaPipe 0.10.17 is loaded only for Pulse. Its model and WASM still require a network connection; camera/video permission is requested only after Begin. Setup reports each phase, times out with a retry path, and releases the camera on failure, disable, navigation, hidden tabs and page exit.

## Source organization

- `index.html`: page structure and early device classification.
- `src/main.js`: entry and graphics failure notice.
- `src/desktop/homepage.js`: profile, contact and entrance.
- `src/desktop/index.js`: WebGL landing/folders, scene orchestration and input.
- `src/desktop/collections.js`: collection grid/carousel, return animation and playback.
- `src/desktop/mind-map.js`: compressed textures, globe and renderer lifetime.
- `src/desktop/pulse.js`: camera hand tracking and tutorial.
- `src/desktop/assets.js`, `governor.js`, `project-data.js`, `folder-previews.js`: media, rendering quality, project content and folder thumbnails.
- `src/mobile/index.js`, `carousel.js`, `gallery.js`, `project-data.js`: phone navigation/profile, image carousel, video gallery and content.
- `src/shared/`: profile content, camera/preparation lifecycle, clipboard, accessibility and media manifest.
- `src/styles/`: original desktop/mobile rules and focused launch corrections.
- `public/assets/`: originals and optimized renditions, still served at `/assets/...`.
- `reference/portfolionew.html`: historical readable implementation, excluded from the production build. Edit `src/`, not this reference.

## Preparing media

Generated media is committed, so ordinary installation/building does not require ffmpeg or Python. Original media is never overwritten.

When adding or replacing artwork, run `npm run media`. This requires ffmpeg, ffprobe and Python 3 with Pillow/WebP support. It creates 480/720/1080-width image variants (without enlargement), muted mobile videos, posters and fifteen cropped folder thumbnails. It writes the media manifest only after every output succeeds. Repeat runs skip unchanged outputs.

Folder preview choices live in `src/desktop/folder-previews.js`; the choices stay fixed across visits, favor opaque portrait artwork, and avoid PNGs. A Thousand Islands has only landscape artwork, cropped to the same card shape. After changing these choices, run `npm run previews` to refresh only the fifteen thumbnails; changing the selection automatically invalidates their cached outputs. The existing KTX2 files are retained. Three's matching Basis transcoder is self-hosted from its pinned package. Image fallback keeps 512px source bitmaps until final disposal so context restoration and re-entry work; compressed textures are the normal lower-memory path.

## GitHub and production

Work on descriptive `codex/...` branches, keep commits focused, run local checks and review before merging to `main`. GitHub Actions verifies changes after an approved push. Git history and the reference preserve the original implementation. A complete local checkpoint was also saved before this migration.

`vercel.json` points Vercel at the static `dist/` output. A root-level `404.html` is included. Do not push, merge into an auto-deployed branch, or trigger a production deployment without the user's approval. Before launch, verify Vercel's actual production branch, domain, error-page routing and preview configuration in the hosting account; repository configuration does not confirm those settings.

## Final launch review

Automated tests use simulated camera/network conditions. Test real camera permissions and the four-second alignment tutorial on the user's intended browsers; verify Safari/iPad and Android devices, slow connections, rapid scene changes, repeated Mind Map entry and return motion. Creative review of image crops and animation feel is still needed. Zoom is available on mobile; the WebGL canvas keeps its own drag controls.

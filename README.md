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

## Desktop Pulse discovery

On the first three Mind Map entries in that browser, the word “Pulse” uses four slow 8% scale cycles, brightening smoothly to white at each peak, with constant opacity. Interacting with its control stops the cue. Reduced-motion preferences disable it. This is a label-only introduction; desktop globe motion and camera activation are unchanged.

## Mobile movement

Project taps and the existing sensitive draggable tabs now use a short coordinated fade instead of racing through unrelated images. Artwork, title, caption, dots and tab selection change together. Touching the image cancels any pending programmed change immediately; native image swiping updates its caption once the scroll settles. All 41 carousel images still load eagerly, and a destination must be decoded before its transition starts. The Gallery name, gallery experience and spacing remain unchanged.

## Mobile Mind Map

The glass button with a centre dot and six surrounding dots beside Projects opens a separate mobile view with a fixed, evenly distributed 55-image selection from the 76 existing references. The cards grow proportionally to keep the globe full and make individual images easier to see. On the first three Home entries in that browser, its outer dots make three smooth full turns over ten seconds and settle into their original-looking arrangement; the centre dot stays fixed. The cue skips reduced-motion preferences. After all project image requests settle, idle-time preparation loads its dependencies, transcodes textures with two workers, and uploads them incrementally without drawing the scene. The completed map stops processing until opened. Save-Data and very slow connections skip speculation; an explicit visit still loads. This reserves one graphics context and texture memory earlier in the visit. The map shares the desktop globe's composition and image movement, with mobile sizing, two texture workers, gradual GPU uploads and a rendering resolution capped at 2× (native density if lower). On high-density phones, sustained rendering below 24 fps for two two-second windows lowers this in 0.25 steps to a 1.2× floor; four healthy windows above 52 fps can restore sharpness. A stable 30 fps power-saving limit is accepted, and loading frames are excluded from measurement. Every image must be ready before the reveal; failures offer Retry or a fixed, evenly distributed 32-image version rather than showing blank cards.

Drag rotates the globe; touching and holding brings nearby images forward immediately, just like desktop. Moving the touch moves the effect while rotating, without cancelling the hold. Mobile uses the shared desktop movement with 6% more baseline outward travel, a further 25% during a full hold, a further 3% travel for the closest focused card and 10% less travel for its neighbors, 32% more local sway (10% above the preceding mobile setting) and an 8% wider effect radius; mobile adjusts the camera framing and uses a full-screen canvas to avoid a visible clipping boundary. Two-finger gestures use the existing camera controls. The mobile scene allows horizontal and vertical rotation with a world-up camera, without an added diagonal tilt. Vertical rotation stops before either pole to prevent flips. Arrow keys rotate and Space engages the effect. Leaving for Profile, Projects or Gallery pauses rendering and input while retaining the prepared scene, textures and rotation for instant return visits. A hidden tab also stops rendering. A full page exit disposes resources; a refresh initializes the map again. Retaining the scene uses memory while other sections are open. Mobile has a small starting rotation around Y and no X tilt; the tile motion remains shared with desktop.

“Touch to interact” fades out on engagement. “Visuals that inspire my design thinking.” fades in below it on every entry, remains readable for at least three seconds, and fades after engagement or six seconds. A Gallery-style track, percentage and rotating copy appear during initial preparation. Progress is a front-weighted estimate of completed texture preparation and uploads, not downloaded bytes; it remains below 100 until the map is ready. The introduction, the two approved lines, and three short attributed quotes rotate at reading-paced intervals; returning to a ready map resumes the same scene without a loader. No visible label precedes the map. Mobile loading retains a 90-second retry deadline to accommodate slow networks and the longer copy sequence; desktop keeps its existing deadline.

Browser checks are useful for layout and behavior, but actual iPhone/Android testing is still required for frame rate, heat and memory before launch. The 32-image fallback is available on loading/graphics failure; it does not silently remove images based on a guessed device tier.

## Preparing media

Generated media is committed, so ordinary installation/building does not require ffmpeg or Python. Original media is never overwritten.

When adding or replacing artwork, run `npm run media`. This requires ffmpeg, ffprobe and Python 3 with Pillow/WebP support. It creates 480/720/1080-width image variants (without enlargement), muted mobile videos, posters and fifteen cropped folder thumbnails. It writes the media manifest only after every output succeeds. Repeat runs skip unchanged outputs.

Each folder preview is now a texture on the actual extruded card, with shared geometry and separate edge material. No overlapping image planes compete for depth. The folder camera uses a depth range suited to the scene, while the glass shells retain their existing instancing and shader.

Folder preview choices live in `src/desktop/folder-previews.js`; the choices stay fixed across visits, favor opaque portrait artwork, and avoid PNGs. A Thousand Islands has only landscape artwork, cropped to the same card shape. After changing these choices, run `npm run previews` to refresh only the fifteen thumbnails; changing the selection automatically invalidates their cached outputs. The existing KTX2 files are retained. Three's matching Basis transcoder is self-hosted from its pinned package. Image fallback keeps 512px source bitmaps until final disposal so context restoration and re-entry work; compressed textures are the normal lower-memory path.

## GitHub and production

Work on descriptive `codex/...` branches, keep commits focused, run local checks and review before merging to `main`. GitHub Actions verifies changes after an approved push. Git history and the reference preserve the original implementation. A complete local checkpoint was also saved before this migration.

`vercel.json` points Vercel at the static `dist/` output. A root-level `404.html` is included. Do not push, merge into an auto-deployed branch, or trigger a production deployment without the user's approval. Before launch, verify Vercel's actual production branch, domain, error-page routing and preview configuration in the hosting account; repository configuration does not confirm those settings.

## Final launch review

Automated tests use simulated camera/network conditions. Test real camera permissions and the four-second alignment tutorial on the user's intended browsers; verify Safari/iPad and Android devices, slow connections, rapid scene changes, repeated Mind Map entry and return motion. Creative review of image crops and animation feel is still needed. Zoom is available on mobile; the WebGL canvas keeps its own drag controls.

## Authorized release workflow

When the user explicitly says to commit, push and deploy the requested changes, that instruction authorizes the complete release: local tests, asset checks, build, checkpoint commit, branch push, pull request, successful GitHub checks, merge to main, and verification of Vercel production. Do not ask for the same production approval again. Otherwise keep work local until production is approved. Destructive operations still require explicit approval. Codex command permission prompts are separate from creative/release approval; saved, narrowly scoped command rules can reduce repeated prompts without disabling protections.

## Mobile clarity and Gallery guidance

Mind Map assets remain 512×512 KTX2 textures with ten mip levels; image fallback is also 512×512. Increasing canvas density improves raster clarity without changing texture download sizes. The retained 55-card selection preserves composition. A 40-card variant would have 27% fewer texture preparations and card draws, but this does not imply a 27% total frame-rate improvement. Phone testing should compare Low Power Mode on and off before reducing the image count.

Gallery says “Swipe up” on the first two entries in each browser. It makes three slow vertical nudges, then fades; swiping or keyboard engagement dismisses it early. Portrait places it well below the video, while landscape puts it at bottom right. Reduced motion keeps the instruction still.

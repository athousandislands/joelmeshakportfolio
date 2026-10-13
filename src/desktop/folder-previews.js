export const FOLDER_PREVIEWS = [
    ['assets/projects/naivaa/collections/summer-land/gallery/summerland3.webp', 'assets/projects/naivaa/collections/chokoleti/gallery/chokoleti-hero.jpg', 'assets/projects/naivaa/collections/slidr/gallery/black-slides.jpg'],
    ['assets/projects/a-thousand-islands/gallery/dynamic-forms.webp', 'assets/projects/a-thousand-islands/gallery/spatial-experience.webp', 'assets/projects/a-thousand-islands/gallery/visual-identity.webp'],
    ['assets/projects/digital-art/gallery/hair.png', 'assets/projects/digital-art/gallery/creator.png', 'assets/projects/digital-art/gallery/corteiz.png'],
    ['assets/projects/graphic-design/collections/posters/amka.webp', 'assets/projects/graphic-design/collections/branding/naivaalogo.png', 'assets/projects/graphic-design/collections/merchandise/home-render.webp'],
    ['assets/projects/mind-map/gallery/1.jpeg', 'assets/projects/mind-map/gallery/14.png', 'assets/projects/mind-map/gallery/66.png'],
];

// The folder bodies keep their existing instancing. Only the fifteen faces
// get small image textures; all transforms still belong to the original cards.
export function createFolderPreviews({ THREE, folders, createRoundedRect }) {
    const shape = createRoundedRect(0, 0, 345.17, 443.33, 29.3, 29.3);
    const geometry = new THREE.ShapeGeometry(shape, 12);
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 345.17, 1 + positions.getY(i) / 443.33);
    const loader = new THREE.TextureLoader();
    const materials = [], textures = [];
    let disposed = false;
    folders.forEach((folder, index) => {
        folder.userData.files.forEach((anchor, card) => {
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
            const face = new THREE.Mesh(geometry, material);
            face.position.z = 3.05; // Extrusion depth 2 plus the existing 1-unit bevel.
            face.visible = false;
            anchor.add(face);
            materials.push(material);
            const path = 'assets/_previews/' + index + '-' + card + '.webp';
            loader.load(path, texture => {
                if (disposed) { texture.dispose(); return; }
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 4;
                material.map = texture;
                material.needsUpdate = true;
                face.visible = true;
                textures.push(texture);
            }, undefined, () => { /* The original card remains visible on failure. */ });
        });
    });
    return { dispose() { disposed = true; textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometry.dispose(); } };
}

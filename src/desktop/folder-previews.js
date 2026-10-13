// Stable, opaque portrait artwork wherever available. A Thousand Islands
// has landscape sources only; its previews use the same portrait crop.
export const FOLDER_PREVIEWS = [
    ['assets/projects/naivaa/collections/summer-land/gallery/summerland3.webp', 'assets/projects/naivaa/collections/chokoleti/gallery/chokoleti-hero.jpg', 'assets/projects/naivaa/collections/slidr/gallery/black-slides.jpg'],
    ['assets/projects/a-thousand-islands/gallery/dynamic-forms.webp', 'assets/projects/a-thousand-islands/gallery/spatial-experience.webp', 'assets/projects/a-thousand-islands/gallery/visual-identity.webp'],
    ['assets/projects/digital-art/gallery/dreamers-residency.webp', 'assets/projects/digital-art/gallery/facade.webp', 'assets/projects/digital-art/gallery/bizaar.webp'],
    ['assets/projects/graphic-design/collections/posters/amka.webp', 'assets/projects/graphic-design/collections/posters/dma.webp', 'assets/projects/graphic-design/collections/merchandise/home-render.webp'],
    ['assets/projects/mind-map/gallery/1.jpeg', 'assets/projects/mind-map/gallery/23.JPG', 'assets/projects/mind-map/gallery/24.JPG'],
];

// Each preview is the face material of one solid card. There is no image
// plane layered over another cap, so depth testing has only one surface.
export function createFolderCardGeometry({ THREE, createRoundedRect }) {
    const width = 345.17, height = 443.33;
    const shape = createRoundedRect(0, 0, width, height, 29.3, 29.3);
    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 2, bevelEnabled: true, bevelSegments: 3,
        steps: 1, bevelSize: 1, bevelThickness: 1,
    });
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    // ExtrudeGeometry assigns material 0 to both caps and 1 to the sides.
    // Its default cap coordinates are measured in shape units, not 0..1.
    for (const group of geometry.groups) {
        if (group.materialIndex !== 0) continue;
        for (let i = group.start; i < group.start + group.count; i++) {
            uv.setXY(i, positions.getX(i) / width, 1 + positions.getY(i) / height);
        }
    }
    return geometry;
}

export function createFolderPreviews({ THREE, folders, createRoundedRect }) {
    const geometry = createFolderCardGeometry({ THREE, createRoundedRect });
    const colors = [0xe6e6e6, 0x989491, 0x0c0c0c];
    const sideMaterials = colors.map(color => new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.1,
    }));
    const loader = new THREE.TextureLoader();
    const materials = [], textures = [], meshes = [];
    let disposed = false;
    folders.forEach((folder, index) => {
        folder.userData.files.forEach((anchor, card) => {
            const faceMaterial = new THREE.MeshBasicMaterial({
                color: colors[card], toneMapped: false,
                transparent: false, depthTest: true, depthWrite: true,
            });
            const mesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterials[card]]);
            mesh.name = `folder-card-${index}-${card}`;
            // The body, image, bevel and back all inherit the same animation.
            anchor.add(mesh);
            meshes.push(mesh);
            materials.push(faceMaterial);
            loader.load(`assets/_previews/${index}-${card}.webp`, texture => {
                if (disposed) { texture.dispose(); return; }
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.anisotropy = 4;
                faceMaterial.color.set(0xffffff);
                faceMaterial.map = texture;
                faceMaterial.needsUpdate = true;
                textures.push(texture);
            }, undefined, () => { /* Keep the solid fallback card on failure. */ });
        });
    });
    return {
        dispose() {
            disposed = true;
            meshes.forEach(mesh => mesh.removeFromParent());
            textures.forEach(texture => texture.dispose());
            materials.forEach(material => material.dispose());
            sideMaterials.forEach(material => material.dispose());
            geometry.dispose();
        },
    };
}

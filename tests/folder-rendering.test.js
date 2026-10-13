import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFolderCardGeometry, createFolderPreviews } from '../src/desktop/folder-previews.js';

function createRoundedRect(x, y, w, h, rx, ry) {
    const shape = new THREE.Shape();
    shape.moveTo(x + rx, -y); shape.lineTo(x + w - rx, -y); shape.quadraticCurveTo(x + w, -y, x + w, -(y + ry));
    shape.lineTo(x + w, -(y + h - ry)); shape.quadraticCurveTo(x + w, -(y + h), x + w - rx, -(y + h));
    shape.lineTo(x + rx, -(y + h)); shape.quadraticCurveTo(x, -(y + h), x, -(y + h - ry));
    shape.lineTo(x, -(y + ry)); shape.quadraticCurveTo(x, -y, x + rx, -y);
    return shape;
}

test('card images occupy the existing front/back caps, with valid texture coordinates', () => {
    const geometry = createFolderCardGeometry({ THREE, createRoundedRect });
    const cap = geometry.groups.find(group => group.materialIndex === 0);
    const side = geometry.groups.find(group => group.materialIndex === 1);
    assert.ok(cap && side);
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    const depths = new Set();
    for (let i = cap.start; i < cap.start + cap.count; i++) {
        depths.add(position.getZ(i));
        assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) <= 1 + 1e-6);
        assert.ok(uv.getY(i) >= -1e-6 && uv.getY(i) <= 1 + 1e-6);
    }
    assert.deepEqual([...depths].sort((a,b) => a-b), [-1, 3]);
    geometry.dispose();
});

test('every animated anchor owns one solid card, without a competing image plane', () => {
    const requests = [];
    class TextureLoader { load(url, success) { requests.push({ url, success }); } }
    const folders = Array.from({ length: 5 }, () => ({ userData: { files: Array.from({ length: 3 }, () => new THREE.Object3D()) } }));
    const previews = createFolderPreviews({ THREE: { ...THREE, TextureLoader }, folders, createRoundedRect });
    const meshes = folders.flatMap(folder => folder.userData.files.flatMap(anchor => anchor.children));
    assert.equal(meshes.length, 15);
    assert.equal(requests.length, 15);
    assert.equal(new Set(meshes.map(mesh => mesh.geometry)).size, 1);
    for (const mesh of meshes) {
        assert.equal(mesh.geometry.type, 'ExtrudeGeometry');
        assert.equal(mesh.position.z, 0);
        assert.equal(mesh.children.length, 0);
        assert.equal(mesh.material[0].transparent, false);
        assert.equal(mesh.material[0].depthWrite, true);
        assert.equal(mesh.material[0].side, THREE.FrontSide);
    }
    const texture = new THREE.Texture();
    requests[0].success(texture);
    assert.equal(meshes[0].material[0].map, texture);
    previews.dispose();
    assert.ok(folders.every(folder => folder.userData.files.every(anchor => anchor.children.length === 0)));
    // A late image request after teardown must not leak a texture.
    const late = new THREE.Texture();
    let disposed = false;
    late.addEventListener('dispose', () => { disposed = true; });
    requests[1].success(late);
    assert.equal(disposed, true);
});

test('folder camera range distinguishes adjacent thin surfaces across the scene', () => {
    const quantize = (distance, near, far) => Math.round((far / (far - near) - far * near / ((far - near) * distance)) * (2 ** 24 - 1));
    const worldGap = 0.05 * 0.018; // The previous overlay's separation after scene scaling.
    let oldCollisions = 0;
    for (let distance = 75; distance < 145; distance += 0.1) {
        if (quantize(distance, 0.1, 2000) === quantize(distance - worldGap, 0.1, 2000)) oldCollisions++;
        assert.notEqual(quantize(distance, 10, 200), quantize(distance - worldGap, 10, 200));
    }
    assert.ok(oldCollisions > 400, 'The old depth range collapses most near-coincident surfaces to the same depth.');
});

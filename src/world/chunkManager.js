// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getStairGeometry } from '../geom/stairFactory.js';

class ChunkManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.activeChunks = new Map();
        this.cache = new ChunkCache(50);
        this.lastCameraChunk = null;
        this.config = null;
    }

    update(cameraPos, config) {
        this.config = config;
        const currentChunk = worldToChunk(
            cameraPos.x, 
            cameraPos.y, 
            cameraPos.z, 
            config.chunkSize
        );

        if (!this.lastCameraChunk || 
            currentChunk.cx !== this.lastCameraChunk.cx ||
            currentChunk.cy !== this.lastCameraChunk.cy ||
            currentChunk.cz !== this.lastCameraChunk.cz) {
            
            this.lastCameraChunk = currentChunk;
            this.updateVisibleChunks(currentChunk, config, cameraPos);
        }
    }

    updateVisibleChunks(centerChunk, config, cameraPos) {
        const { viewChunksXY, viewChunksZ } = config;
        const desiredChunks = new Set();

        for (let dx = -viewChunksXY; dx <= viewChunksXY; dx++) {
            for (let dy = -viewChunksXY; dy <= viewChunksXY; dy++) {
                for (let dz = -viewChunksZ; dz <= viewChunksZ; dz++) {
                    const cx = centerChunk.cx + dx;
                    const cy = centerChunk.cy + dy;
                    const cz = centerChunk.cz + dz;
                    const key = createChunkKey(cx, cy, cz);
                    
                    desiredChunks.add(key);

                    if (!this.activeChunks.has(key)) {
                        this.loadChunk(cx, cy, cz, config, cameraPos);
                    }
                }
            }
        }

        this.unloadUnusedChunks(desiredChunks);
    }

    loadChunk(cx, cy, cz, config, cameraPos) {
        const key = createChunkKey(cx, cy, cz);
        let chunkData = this.cache.get(key);

        if (!chunkData) {
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            this.cache.set(key, chunkData);
        }

        const group = this.createChunkMesh(chunkData, config);
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);
    }

    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        const grouped = this.groupPrimitives(primitives);

        for (const [typeSlot, items] of Object.entries(grouped)) {
            const lastPipeIndex = typeSlot.lastIndexOf('|');
            if (lastPipeIndex === -1) continue;
            
            const slot = typeSlot.substring(lastPipeIndex + 1);
            const fullType = typeSlot.substring(0, lastPipeIndex);
            
            const mesh = this.createInstancedMesh(fullType, slot, items, config);
            if (mesh) group.add(mesh);
        }

        return group;
    }

    groupPrimitives(primitives) {
        const grouped = {};
        for (const prim of primitives) {
            if (!prim.type || !prim.position) continue;
            
            // Для новых лестниц тип уже содержит направление (stair_north), 
            // поэтому variantSuffix не нужен
            const key = `${prim.type}|${prim.paletteSlot || 'base'}`;
            
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(prim);
        }
        return grouped;
    }

    createInstancedMesh(type, slot, items, config) {
        if (!items || items.length === 0) return null;

        const activePalette = palettes[config.palette] || palettes.blame;
        const colorHex = activePalette[slot] || activePalette.base;
        
        // Передаем type напрямую, без парсинга variant
        const geometry = this.createGeometry(type, null, config, items[0]);
        
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex), flatShading: true, side: THREE.DoubleSide
        });

        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; 
        const dummy = new THREE.Object3D();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            const px = item.position?.x ?? 0;
            const py = item.position?.y ?? 0;
            const pz = item.position?.z ?? 0;
            dummy.position.set(px, py, pz);

            // УБРАНО: Ручной поворот через dummy.rotation.y
            // Геометрия из getStairGeometry уже повернута правильно
            
            let twistZ = item.rotation?.twistZ || 0;
            dummy.rotation.set(0, 0, THREE.MathUtils.degToRad(twistZ));

            dummy.scale.set(item.scale?.x ?? 1, item.scale?.y ?? 1, item.scale?.z ?? 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    createGeometry(type, variant, config, item = null) {
        const segments = config.maxSegments || 16;
        
        switch (type) {
            // === БАЗОВЫЕ ПРИМИТИВЫ ===
            case 'box':
                return new THREE.BoxGeometry(1, 1, 1);
            
            case 'cylinder':
                return new THREE.CylinderGeometry(0.5, 0.5, 1, segments);
            
            case 'cone':
                return new THREE.ConeGeometry(0.5, 1, segments);
            
            case 'octahedron':
                return new THREE.OctahedronGeometry(0.5);
            
            case 'capsule':
                return new THREE.CapsuleGeometry(0.5, 1, 4, segments);
            
            case 'torus':
                return new THREE.TorusGeometry(0.5, 0.2, 8, segments);
            
            case 'sphere':
                return new THREE.SphereGeometry(0.5, segments, segments);
            
            case 'obelisk':
                return new THREE.ConeGeometry(0.4, 1, 4); 
            
            case 'spire':
                return new THREE.ConeGeometry(0.2, 1, 8);

            // === ЛЕСТНИЦЫ И МОСТЫ (через StairFactory) ===
            case 'stair_north':
            case 'stair_south':
            case 'stair_east':
            case 'stair_west':
            case 'bridge_ns':
            case 'bridge_ew':
                if (typeof getStairGeometry !== 'undefined') {
                    // Для лестниц важны параметры толщины и высоты яруса
                    // Для мостов эти параметры игнорируются внутри factory, но передаем для единообразия
                    const p = item?.params || {};
                    const pt = p.platformThickness || config.platformThickness;
                    const lh = p.levelHeight || config.levelHeight;
                    
                    return getStairGeometry(type, pt, lh);
                }
                console.warn(`getStairGeometry is not defined for ${type}`);
                return new THREE.BoxGeometry(1, 1, 1);

            // === LEGACY ПОДДЕРЖКА ===
            case 'platform_stair':
                if (typeof getStairGeometry !== 'undefined') {
                    return getStairGeometry(`stair_${variant || 'east'}`);
                }
                return new THREE.BoxGeometry(1, 1, 1);

            default:
                console.warn(`Unknown geometry type: "${type}"`);
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                this.activeChunks.delete(key);
            }
        }
    }

    disposeChunk(chunk) {
        chunk.traverse((child) => {
            if (child.isInstancedMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }

    clear() {
        for (const [key, chunk] of this.activeChunks) {
            this.sceneManager.scene.remove(chunk);
            this.disposeChunk(chunk);
        }
        this.activeChunks.clear();
        this.cache.clear();
        this.lastCameraChunk = null;
        console.log('🧹 All chunks cleared');
    }
}

export default ChunkManager;

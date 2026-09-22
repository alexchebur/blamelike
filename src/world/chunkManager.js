// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getPlatformStairGeometry } from '../geom/stairFactory.js';

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
            const [type, slot] = typeSlot.split('|');
            const mesh = this.createInstancedMesh(type, slot, items, config);
            if (mesh) group.add(mesh);
        }

        return group;
    }

    groupPrimitives(primitives) {
        const grouped = {};
        for (const prim of primitives) {
            // Включаем variant в ключ, чтобы разные направления лестниц 
            // попадали в разные InstancedMesh
            const variantKey = prim.variant ? `_${prim.variant}` : '';
            const key = `${prim.type}${variantKey}|${prim.paletteSlot}`;
            
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(prim);
        }
        return grouped;
    }
    createInstancedMesh(type, slot, items, config) {
        if (items.length === 0) return null;

        const activePalette = palettes[config.palette] || palettes.blame;
        const colorHex = activePalette[slot] || activePalette.base;
        
        // Передаем variant для лестниц
        const geometry = this.createGeometry(type, items[0].variant, config);
        
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex),
            flatShading: true,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; 
        
        const dummy = new THREE.Object3D();
        
        // === ПАРАМЕТРЫ ЧАНКА ДЛЯ КОНВЕРТАЦИИ GRID -> WORLD ===
        const { chunkSize, gridSize, levelHeight } = config;
        const cellSize = chunkSize / gridSize;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // === КЛЮЧЕВОЙ БЛОК: КОНВЕРТАЦИЯ GRID-FIRST В МИРОВЫЕ КООРДИНАТЫ ===
            let wx = 0, wy = 0, wz = 0;
            
            if (item.grid) {
                // Базовый центр клетки
                wx = (item.grid.gx + 0.5) * cellSize;
                wy = item.grid.level * levelHeight;
                wz = (item.grid.gy + 0.5) * cellSize;

                // Применяем локальные смещения (offset)
                if (item.offset) {
                    wx += item.offset.x || 0;
                    wy += item.offset.y || 0;
                    wz += item.offset.z || 0;
                }
            } else if (item.position) {
                // Фолбэк для старого декора/монолитов
                wx = item.position.x;
                wy = item.position.y;
                wz = item.position.z;
            }

            dummy.position.set(wx, wy, wz);

            // Поворот
            let twistZ = item.rotation?.twistZ || 0;
            dummy.rotation.set(0, 0, THREE.MathUtils.degToRad(twistZ));
            
            // Обработка variant для поворота вокруг Y (для лестниц)
            if (item.variant === 'west') dummy.rotation.y = Math.PI;
            else if (item.variant === 'north') dummy.rotation.y = -Math.PI / 2;
            else if (item.variant === 'south') dummy.rotation.y = Math.PI / 2;
            // 'east' — базовое направление, поворот 0

            dummy.scale.set(item.scale.x, item.scale.y, item.scale.z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    createGeometry(type, variant, config) {
        const segments = config.maxSegments || 16;
        
        switch (type) {
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

            // --- Лестницы ---
            case 'platform_stair':
                if (typeof getPlatformStairGeometry !== 'undefined') {
                    return getPlatformStairGeometry(variant || 'east');
                }
                return new THREE.BoxGeometry(1, 1, 1);

            default:
                console.warn(`Unknown geometry type: ${type}`);
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

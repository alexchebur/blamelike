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
            // typeSlot имеет формат "type|slot" или "type_variant|slot"
            // Мы используем ТОЛЬКО последний '|' как разделитель слота
            const lastPipeIndex = typeSlot.lastIndexOf('|');
            if (lastPipeIndex === -1) continue; // Пропускаем некорректные ключи
            
            const slot = typeSlot.substring(lastPipeIndex + 1);
            const fullTypeWithVariant = typeSlot.substring(0, lastPipeIndex);
            
            const mesh = this.createInstancedMesh(fullTypeWithVariant, slot, items, config);
            if (mesh) group.add(mesh);
        }

        return group;
    }

    groupPrimitives(primitives) {
        const grouped = {};
        for (const prim of primitives) {
            // Фильтруем примитивы без позиции или типа (защита от мусора)
            if (!prim.type || !prim.position) continue;
            
            // Формируем ключ: "type[_variant]|paletteSlot"
            const variantSuffix = prim.variant ? `_${prim.variant}` : '';
            const key = `${prim.type}${variantSuffix}|${prim.paletteSlot || 'base'}`;
            
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(prim);
        }
        return grouped;
    }

    createInstancedMesh(fullTypeWithVariant, slot, items, config) {
        if (!items || items.length === 0) return null;

        // Парсим тип и вариант. Вариант всегда идет ПОСЛЕ последнего '_' в первой части ключа
        let type = fullTypeWithVariant;
        let variant = null;
        
        const lastUnderscore = fullTypeWithVariant.lastIndexOf('_');
        // Проверяем, что после '_' идет известный вариант, а не часть имени типа
        const possibleVariant = fullTypeWithVariant.substring(lastUnderscore + 1);
        if (['east', 'west', 'north', 'south'].includes(possibleVariant)) {
            variant = possibleVariant;
            type = fullTypeWithVariant.substring(0, lastUnderscore);
        }

        const activePalette = palettes[config.palette] || palettes.blame;
        const colorHex = activePalette[slot] || activePalette.base;
        

        const geometry = this.createGeometry(type, variant, config, items[0]);
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex), flatShading: true, side: THREE.DoubleSide
        });

        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; 
        const dummy = new THREE.Object3D();

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // === ЗАЩИТНАЯ ПРОВЕРКА ===
            // Если у примитива нет position, ставим его в (0,0,0) вместо краша
            const px = item.position?.x ?? 0;
            const py = item.position?.y ?? 0;
            const pz = item.position?.z ?? 0;
            dummy.position.set(px, py, pz);

            let twistZ = item.rotation?.twistZ || 0;
            dummy.rotation.set(0, 0, THREE.MathUtils.degToRad(twistZ));
            
            // Применяем поворот варианта для лестниц
            if (variant === 'west') dummy.rotation.y = Math.PI;
            else if (variant === 'north') dummy.rotation.y = -Math.PI / 2;
            else if (variant === 'south') dummy.rotation.y = Math.PI / 2;

            dummy.scale.set(item.scale?.x ?? 1, item.scale?.y ?? 1, item.scale?.z ?? 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    /**
     * Создание геометрии по типу
     * @param {string} type 
     * @param {string} variant - вариант формы (например, направление лестницы: east/west/north/south)
     * @param {Object} config 
     * @param {Object} [item] - сам примитив (для доступа к params)
     * @returns {THREE.BufferGeometry}
     */
    createGeometry(type, variant, config, item = null) {
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

            // --- Лестницы (интегрированные в платформу) ---
            case 'platform_stair':
                if (typeof getPlatformStairGeometry !== 'undefined') {
                    // Вычисляем точное соотношение толщины плиты к высоте яруса
                    // Берем из params примитива (если есть) или из конфига по умолчанию
                    const pt = (item && item.params && item.params.platformThickness) 
                        ? item.params.platformThickness 
                        : config.platformThickness;
                    
                    const lh = (item && item.params && item.params.levelHeight) 
                        ? item.params.levelHeight 
                        : config.levelHeight;

                    // Защита от деления на ноль и некорректных значений
                    const thicknessRatio = (lh > 0) ? (pt / lh) : 0.1;

                    return getPlatformStairGeometry(variant || 'east', thicknessRatio);
                } else {
                    console.warn('getPlatformStairGeometry is not defined');
                    return new THREE.BoxGeometry(1, 1, 1);
                }

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

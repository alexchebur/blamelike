// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getPlatformStairGeometry } from '../geom/stairFactory.js';

class ChunkManager {
    /**
     * @param {import('../render/sceneManager.js').default} sceneManager 
     */
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
                    } else {
                        // LOD можно обновлять здесь при необходимости
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
            //console.log(`🔄 Generating data for chunk [${cx}, ${cy}, ${cz}]`);
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            this.cache.set(key, chunkData);
        }
        const group = this.createChunkMesh(chunkData, config);
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);
    }

    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        // Группируем все примитивы
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
            // Пропускаем устаревшие типы, если они вдруг остались в кэше
            if (prim.type === 'line' || prim.type.startsWith('stair_') || prim.type === 'ramp') {
                continue;
            }
            const key = `${prim.type}|${prim.paletteSlot}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(prim);
        }
        return grouped;
    }

    /**
     * Создание InstancedMesh для группы примитивов
     * @param {string} type - тип геометрии
     * @param {string} slot - цветовой слот
     * @param {Array} items - массив примитивов
     * @param {Object} config 
     * @returns {THREE.InstancedMesh|null}
     */
    createInstancedMesh(type, slot, items, config) {
        if (items.length === 0) return null;
        
        // Получаем палитру из конфига
        const activePalette = palettes[config.palette] || palettes.blame;
        const colorHex = activePalette[slot] || activePalette.base;
        
        // ИСПРАВЛЕНИЕ: Извлекаем параметры из первого элемента группы
        // Они одинаковы для всех элементов одного типа в этой группе
        const params = items[0].params || {};
        
        // Создаем геометрию, передавая параметры
        const geometry = this.createGeometry(type, config, params);
        
        // Создаем материал
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex),
            flatShading: true,
            side: THREE.DoubleSide
        });

        // Создаем InstancedMesh
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; 
        
        const dummy = new THREE.Object3D();
        // === БАЗОВЫЙ ПОВОРОТ ДЛЯ СИСТЕМЫ Z-UP ===
        // Стандартные геометрии Three.js растут вдоль оси Y.
        // Чтобы они корректно стояли в мире, где высота — это Z,
        // нам нужно повернуть их на -90 градусов по оси X.
        const baseRotation = new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ');
        // ==========================================

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            dummy.position.set(item.position.x, item.position.y, item.position.z);
            
            // Базовые углы из генератора
            let tiltX = item.rotation.tiltX || 0;
            let tiltY = item.rotation.tiltY || 0;
            let twistZ = item.rotation.twistZ || 0;

            // === ПРИМЕНЯЕМ СМЕЩЕНИЯ ТОЛЬКО ДЛЯ ЛЕСТНИЦ ===
            if (type.startsWith('platform_stair_')) {
                twistZ += config.stairTwistOffset || 0;
                tiltX += config.stairTiltOffset || 0;
            }
            
            // Устанавливаем поворот из данных + базовый поворот для Z-up
            dummy.rotation.set(
                THREE.MathUtils.degToRad(tiltX),
                THREE.MathUtils.degToRad(tiltY),
                THREE.MathUtils.degToRad(twistZ)
            );
            
            // Применяем базовый поворот (преумножаем кватернион)
            dummy.quaternion.premultiply(new THREE.Quaternion().setFromEuler(baseRotation));
            
            dummy.scale.set(item.scale.x, item.scale.y, item.scale.z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    /**
     * Создание геометрии по типу
     * @param {string} type 
     * @param {Object} config 
     * @param {Object} params - дополнительные параметры (например, thicknessRatio)
     * @returns {THREE.BufferGeometry}
     */
    createGeometry(type, config, params = {}) {
        const segments = config.maxSegments || 16;
        const levelHeight = config.levelHeight || 20;
        
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
            case 'prism':
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            case 'sphere':
                return new THREE.SphereGeometry(0.5, segments, segments);
            // --- Специфичные типы ---
            case 'obelisk':
                return new THREE.ConeGeometry(0.4, 1, 4); 
            case 'spire':
                return new THREE.ConeGeometry(0.2, 1, 8);
            
            // --- Новые типы платформ с интегрированными лестницами ---
            case 'platform_stair_x_pos':
            case 'platform_stair_x_neg':
            case 'platform_stair_y_pos':
            case 'platform_stair_y_neg':
                if (typeof getPlatformStairGeometry !== 'undefined') {
                    const dir = type.replace('platform_stair_', '');
                    // ИСПРАВЛЕНИЕ: Используем params.thicknessRatio
                    const thicknessRatio = params.thicknessRatio || (config.platformThickness / levelHeight);
                    return getPlatformStairGeometry(dir, thicknessRatio);
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

// @ts-check
/**
 * ChunkManager — управляет загрузкой/выгрузкой чанков вокруг камеры
 * Реализует LRU-кэш, LOD по дистанции и стриминг
 */

import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

class ChunkManager {
    /**
     * @param {import('../render/sceneManager.js').default} sceneManager 
     */
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // Хранилище активных чанков: Map<key, THREE.Group>
        this.activeChunks = new Map();
        
        // LRU-кэш для данных примитивов (не мешей!)
        this.cache = new ChunkCache(50);
        
        // Текущая позиция камеры (для отслеживания движения)
        this.lastCameraChunk = null;
        
        // Настройки
        this.config = null;
    }
    
    /**
     * Обновление чанков вокруг камеры
     * Вызывается каждый кадр или при значительном движении камеры
     * @param {THREE.Vector3} cameraPos - позиция камеры
     * @param {Object} config - текущая конфигурация
     */
    update(cameraPos, config) {
        this.config = config;
        
        // Определяем чанк, в котором находится камера
        const currentChunk = worldToChunk(
            cameraPos.x,
            cameraPos.y,
            cameraPos.z,
            config.chunkSize
        );
        
        // Если камера перешла в новый чанк или изменились настройки
        if (!this.lastCameraChunk || 
            currentChunk.cx !== this.lastCameraChunk.cx ||
            currentChunk.cy !== this.lastCameraChunk.cy ||
            currentChunk.cz !== this.lastCameraChunk.cz) {
            
            this.lastCameraChunk = currentChunk;
            this.updateVisibleChunks(currentChunk, config, cameraPos);
        }
    }
    
    /**
     * Обновление видимых чанков вокруг заданной позиции
     * @param {{cx: number, cy: number, cz: number}} centerChunk 
     * @param {Object} config 
     * @param {THREE.Vector3} cameraPos
     */
    updateVisibleChunks(centerChunk, config, cameraPos) {
        const { viewChunksXY, viewChunksZ } = config;
        
        // Множество ключей чанков, которые должны быть видны
        const desiredChunks = new Set();
        
        // Генерируем список всех чанков в радиусе видимости
        for (let dx = -viewChunksXY; dx <= viewChunksXY; dx++) {
            for (let dy = -viewChunksXY; dy <= viewChunksXY; dy++) {
                for (let dz = -viewChunksZ; dz <= viewChunksZ; dz++) {
                    const cx = centerChunk.cx + dx;
                    const cy = centerChunk.cy + dy;
                    const cz = centerChunk.cz + dz;
                    
                    const key = createChunkKey(cx, cy, cz);
                    desiredChunks.add(key);
                    
                    // Загружаем чанк если его нет
                    if (!this.activeChunks.has(key)) {
                        this.loadChunk(cx, cy, cz, config, cameraPos);
                    } else {
                        // Если чанк уже есть, возможно стоит обновить его LOD
                        this.updateChunkLOD(key, cameraPos, config);
                    }
                }
            }
        }
        
        // Выгружаем чанки, которые больше не нужны
        this.unloadUnusedChunks(desiredChunks);
    }
    
    /**
     * Загрузка одного чанка
     * @param {number} cx 
     * @param {number} cy 
     * @param {number} cz 
     * @param {Object} config 
     * @param {THREE.Vector3} cameraPos
     */
    loadChunk(cx, cy, cz, config, cameraPos) {
        const key = createChunkKey(cx, cy, cz);
        
        // Проверяем кэш данных (PrimitiveRecord[])
        let chunkData = this.cache.get(key);
        
        if (!chunkData) {
            console.log(`🔄 Generating data for chunk [${cx}, ${cy}, ${cz}]`);
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            
            // Сохраняем сырые данные в кэш
            this.cache.set(key, chunkData);
        }
        
        // Создаем визуальное представление (Mesh)
        const group = this.createChunkMesh(chunkData, config);
        
        // Добавляем в активные чанки и сцену
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);
    }

    /**
     * Обновление LOD существующего чанка (заглушка для будущей логики)
     * @param {string} key 
     * @param {THREE.Vector3} cameraPos 
     * @param {Object} config 
     */
    updateChunkLOD(key, cameraPos, config) {
        // Здесь можно реализовать пересборку меша при изменении дистанции
        // Например, удалить микро-декор если чанк стал "far"
    }
    
    /**
     * Создание Three.js мешей из данных чанка
     * @param {Array} primitives 
     * @param {Object} config 
     * @returns {THREE.Group}
     */
    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        
        // Группируем примитивы по типу и paletteSlot
        const grouped = this.groupPrimitives(primitives);
        
        for (const [typeSlot, items] of Object.entries(grouped)) {
            const [type, slot] = typeSlot.split('|');
            
            // Создаем InstancedMesh для каждой группы
            const mesh = this.createInstancedMesh(type, slot, items, config);
            
            if (mesh) {
                group.add(mesh);
            }
        }
        
        return group;
    }
    
    /**
     * Группировка примитивов по типу геометрии и цветовому слоту
     * @param {Array} primitives 
     * @returns {Object} { "box|base": [...], "cylinder|accent": [...] }
     */
    groupPrimitives(primitives) {
        const grouped = {};
        
        for (const prim of primitives) {
            const key = `${prim.type}|${prim.paletteSlot}`;
            
            if (!grouped[key]) {
                grouped[key] = [];
            }
            
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
        
        // Создаем геометрию (общую для всех инстансов этого типа)
        const geometry = this.createGeometry(type, config);
        
        // Создаем материал
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex),
            flatShading: true,
            side: THREE.DoubleSide
        });
        
        // Создаем InstancedMesh
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; // Включаем отсечение по фрустуму
        
        // Устанавливаем матрицы для каждого инстанса
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            dummy.position.set(item.position.x, item.position.y, item.position.z);
            
            // Конвертируем градусы в радианы
            dummy.rotation.set(
                THREE.MathUtils.degToRad(item.rotation.tiltX || 0),
                THREE.MathUtils.degToRad(item.rotation.tiltY || 0),
                THREE.MathUtils.degToRad(item.rotation.twistZ || 0)
            );
            
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
     * @returns {THREE.BufferGeometry}
     */
    createGeometry(type, config) {
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
                // Шестиугольная призма
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            
            case 'sphere':
                return new THREE.SphereGeometry(0.5, segments, segments);

            // --- Специфичные типы ---
            
            case 'obelisk':
                return new THREE.ConeGeometry(0.4, 1, 4); 
            
            case 'spire':
                return new THREE.ConeGeometry(0.2, 1, 8);

            // --- Лестницы (процедурные ступени без боковин) ---
            case 'stair_1':
            case 'stair_2':
            case 'stair_3':
                const levels = type === 'stair_1' ? 1 : type === 'stair_2' ? 2 : 3;
                
                const totalHeight = levels * config.levelHeight;
                const stepH = config.stepHeight || 2; 
                const stepD = config.stepDepth || 2;  
                const width = (config.stairWidthRatio || 0.1) * (config.chunkSize / config.gridSize);
                
                const stepsCount = Math.floor(totalHeight / stepH);
                const geometries = [];

                for (let i = 0; i < stepsCount; i++) {
                    const stepGeo = new THREE.BoxGeometry(width, stepH, stepD);
                    // Смещаем ступени вверх и вперед (по Z)
                    stepGeo.translate(0, i * stepH + stepH / 2, -i * stepD);
                    geometries.push(stepGeo);
                }
                
                // Объединяем в одну геометрию
                return mergeGeometries(geometries);
                
                // Добавляем боковые стенки для прочности вида
                const sideGeo = new THREE.BoxGeometry(width * 0.1, totalHeight, stepsCount * stepD);
                sideGeo.translate(-width / 2 - width * 0.05, totalHeight / 2, -(stepsCount * stepD) / 2);
                geometries.push(sideGeo);
                
                const sideGeo2 = sideGeo.clone();
                sideGeo2.translate(width + width * 0.1, 0, 0);
                geometries.push(sideGeo2);

                return mergeGeometries(geometries);
            
            default:
                console.warn(`Unknown geometry type: ${type}`);
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }
    
    /**
     * Выгрузка неиспользуемых чанков
     * @param {Set} desiredKeys - множество ключей чанков, которые должны остаться
     */
    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                // Удаляем из сцены
                this.sceneManager.scene.remove(chunk);
                
                // Освобождаем память (геометрию и материалы)
                this.disposeChunk(chunk);
                
                // Удаляем из активных
                this.activeChunks.delete(key);
            }
        }
    }
    
    /**
     * Освобождение ресурсов чанка
     * @param {THREE.Group} chunk 
     */
    disposeChunk(chunk) {
        chunk.traverse((child) => {
            if (child.isInstancedMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
    
    /**
     * Очистка всех чанков
     */
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

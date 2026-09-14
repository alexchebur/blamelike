// @ts-check
/**
 * ChunkManager — управляет загрузкой/выгрузкой чанков вокруг камеры
 * Реализует LRU-кэш, LOD по дистанции и стриминг в Web Worker
 */

import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';

class ChunkManager {
    /**
     * @param {import('../render/sceneManager.js').default} sceneManager 
     */
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        
        // Хранилище активных чанков: Map<key, Chunk>
        this.activeChunks = new Map();
        
        // LRU-кэш для быстрого доступа
        this.cache = new ChunkCache(50);
        
        // Текущая позиция камеры (для отслеживания движения)
        this.lastCameraChunk = null;
        
        // Очередь генерации (если используем Worker)
        this.generationQueue = [];
        this.isGenerating = false;
        
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
            this.updateVisibleChunks(currentChunk, config);
        }
    }
    
    /**
     * Обновление видимых чанков вокруг заданной позиции
     * @param {{cx: number, cy: number, cz: number}} centerChunk 
     * @param {Object} config 
     */
    updateVisibleChunks(centerChunk, config) {
        const { viewChunksXY, viewChunksZ, chunkSize } = config;
        
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
                        this.loadChunk(cx, cy, cz, config);
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
     */
    loadChunk(cx, cy, cz, config) {
        const key = createChunkKey(cx, cy, cz);
        
        // Проверяем кэш
        let chunkData = this.cache.get(key);
        
        if (!chunkData) {
            // Генерируем чанк
            console.log(`🔄 Generating chunk [${cx}, ${cy}, ${cz}]`);
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            
            // Сохраняем в кэш
            this.cache.set(key, chunkData);
        }
        
        // Создаем визуальное представление чанка
        const chunk = this.createChunkMesh(chunkData, config);
        
        // Добавляем в активные чанки
        this.activeChunks.set(key, chunk);
    }
    
    /**
     * Создание Three.js мешей из данных чанка
     * @param {Array} primitives - массив PrimitiveRecord
     * @param {Object} config 
     * @returns {THREE.Group} группа с InstancedMesh
     */
    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        
        // Группируем примитивы по типу и paletteSlot
        const grouped = this.groupPrimitives(primitives);
        
        // Для каждой группы создаем InstancedMesh
        for (const [typeSlot, items] of Object.entries(grouped)) {
            const [type, slot] = typeSlot.split('|');
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
        
        // Получаем палитру
        const palette = this.getPalette(config.palette);
        const color = palette[slot] || palette.base;
        
        // Создаем геометрию
        const geometry = this.createGeometry(type, config);
        
        // Создаем материал
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(color),
            flatShading: true
        });
        
        // Создаем InstancedMesh
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        
        // Устанавливаем матрицы для каждого инстанса
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            dummy.position.set(item.position.x, item.position.y, item.position.z);
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
                // Капсула как комбинация цилиндра и двух полусфер
                return new THREE.CapsuleGeometry(0.5, 1, 4, segments);
            
            case 'torus':
                return new THREE.TorusGeometry(0.5, 0.2, 8, segments);
            
            case 'prism':
                // Призма как цилиндр с малым количеством сегментов
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
            
            case 'sphere':
                return new THREE.SphereGeometry(0.5, segments, segments);
            
            default:
                console.warn(`Unknown geometry type: ${type}`);
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }
    
    /**
     * Получение активной палитры
     * @param {string} paletteName 
     * @returns {Object}
     */
    getPalette(paletteName) {
        const palettes = {
            blame: {
                base: '#2a2a2a',
                baseLight: '#3a3a3a',
                baseDark: '#1a1a1a',
                accent: '#4a4a4a',
                glow: '#ff6600',
                shadow: '#0a0a0a'
            },
            rusted: {
                base: '#4a3728',
                baseLight: '#5c4533',
                baseDark: '#3a2a1f',
                accent: '#8b4513',
                glow: '#ff4500',
                shadow: '#1a0f0a'
            },
            coldSpace: {
                base: '#1a2a3a',
                baseLight: '#2a3a4a',
                baseDark: '#0a1a2a',
                accent: '#4a6a8a',
                glow: '#00ffff',
                shadow: '#050a0f'
            },
            sandCity: {
                base: '#8b7355',
                baseLight: '#a08968',
                baseDark: '#6b5344',
                accent: '#d4a574',
                glow: '#ffd700',
                shadow: '#3a2a1a'
            },
            neonCyber: {
                base: '#1a1a2e',
                baseLight: '#2a2a3e',
                baseDark: '#0a0a1e',
                accent: '#ff00ff',
                glow: '#00ff00',
                shadow: '#050510'
            }
        };
        
        return palettes[paletteName] || palettes.blame;
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
                
                // Освобождаем память
                this.disposeChunk(chunk);
                
                // Удаляем из активных
                this.activeChunks.delete(key);
                
                console.log(`🗑️ Unloaded chunk ${key}`);
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

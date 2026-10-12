// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getStairGeometry } from '../geom/stairFactory.js';
import { createLCableGeometry } from '../geom/meshFactory.js';

/**
 * Определяет, является ли примитив проходимым (опорой для игрока).
 * Единая функция для heightMap и collisionLayer, чтобы избежать рассинхрона.
 * @param {Object} prim - PrimitiveRecord
 * @returns {boolean}
 */
function isWalkablePrimitive(prim) {
    // Явно исключаем непроходимые типы
    if (prim.role === 'decor' || prim.role === 'micro') return false;
    if (prim.type === 'screen') return false;
    if (prim.type === 'cable' || prim.type === 'l_cable') return false;
    if (prim.type === 'torus') return false; // Торусы обычно декоративные кольца
    
    // Всё остальное считаем потенциальной опорой:
    // box, platform_stair, stair_*, bridge_*, arch, cylinder, cone, obelisk, spire, capsule, mega_block...
    return true;
}

class ChunkManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        /** @type {Map<string, THREE.Group>} */
        this.activeChunks = new Map();
        this.cache = new ChunkCache(50);
        this.lastCameraChunk = null;
        this.config = null;
        
        // Логическая карта высот (для спавна и быстрой проверки без raycast)
        // Key: "gridX,gridZ", Value: { y: number, isLadder: boolean, type: string }
        this.heightMap = new Map(); 
    }

    update(cameraPos, config) {
        this.config = config;
        const currentChunk = worldToChunk(cameraPos.x, cameraPos.y, cameraPos.z, config.chunkSize);
        const distChanged = this.config?.maxRenderDistance !== config.maxRenderDistance;
        
        if (!this.lastCameraChunk || 
            currentChunk.cx !== this.lastCameraChunk.cx ||
            currentChunk.cy !== this.lastCameraChunk.cy ||
            currentChunk.cz !== this.lastCameraChunk.cz ||
            distChanged) {
            this.lastCameraChunk = currentChunk;
            this.updateVisibleChunks(currentChunk, config, cameraPos);
        }
    }

    updateVisibleChunks(centerChunk, config, cameraPos) {
        const { viewChunksXY, viewChunksZ, chunkSize, maxRenderDistance = 300 } = config;
        const maxDistSq = maxRenderDistance * maxRenderDistance;
        
        const desiredChunks = new Set();

        // === ИЗМЕНЕНО: Динамический расчет диапазона чанков по Y ===
        // Вместо фиксированных yMin/yMax, берем радиус вокруг текущего чанка игрока
        const viewChunksY = Math.max(2, viewChunksZ); // Минимум 2 чанка вверх/вниз
        
        for (let dx = -viewChunksXY; dx <= viewChunksXY; dx++) {
            for (let dy = -viewChunksY; dy <= viewChunksY; dy++) { // <-- Используем динамический dy
                for (let dz = -viewChunksZ; dz <= viewChunksZ; dz++) {
                    const cx = centerChunk.cx + dx;
                    const cy = centerChunk.cy + dy; // <-- Теперь cy зависит от позиции игрока
                    const cz = centerChunk.cz + dz;
                    
                    const chunkCenterX = (cx + 0.5) * chunkSize;
                    const chunkCenterY = (cy + 0.5) * chunkSize;
                    const chunkCenterZ = (cz + 0.5) * chunkSize;
                    
                    const distSq = Math.pow(chunkCenterX - cameraPos.x, 2) +
                                   Math.pow(chunkCenterY - cameraPos.y, 2) +
                                   Math.pow(chunkCenterZ - cameraPos.z, 2);
                    
                    if (distSq > maxDistSq) continue;

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

    /**
     * Ищет безопасную точку спавна рядом с центром
     */
    findSpawnPoint(center, radius = 1) {
        if (!this.config) return null;
        
        const cx = Math.floor(center.x / this.config.chunkSize);
        const cy = Math.floor(center.y / this.config.chunkSize);
        const cz = Math.floor(center.z / this.config.chunkSize);

        // Сначала пробуем найти платформу через heightMap (быстро)
        const cellSize = this.config.chunkSize / this.config.gridSize;
        const gridX = Math.floor(center.x / cellSize);
        const gridZ = Math.floor(center.z / cellSize);
        
        // Проверяем окрестности в heightMap
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const key = `${gridX + dx},${gridZ + dz}`;
                const data = this.heightMap.get(key);
                if (data && !data.isLadder) {
                    return {
                        x: (gridX + dx + 0.5) * cellSize,
                        y: data.y + 2,
                        z: (gridZ + dz + 0.5) * cellSize,
                        platformHeight: data.y
                    };
                }
            }
        }

        // Fallback: поиск через примитивы чанков (если heightMap пуст или не нашел)
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const key = createChunkKey(cx + dx, cy + dy, cz + dz);
                    const chunk = this.activeChunks.get(key);
                    
                    if (chunk && chunk.userData.primitives) {
                        for (const prim of chunk.userData.primitives) {
                            if (isWalkablePrimitive(prim) && prim.type === 'box') {
                                const topY = prim.position.y + (Math.abs(prim.scale.y) / 2);
                                return {
                                    x: prim.position.x,
                                    y: topY + 2,
                                    z: prim.position.z,
                                    platformHeight: topY
                                };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    /**
     * Получает высоту пола в мировых координатах X,Z
     */
    getLogicalHeight(x, z) {
        if (!this.config) return null;
        const cellSize = this.config.chunkSize / this.config.gridSize;
        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        
        return this.heightMap.get(key) || null;
    }

    /**
     * Обновляет логическую карту высот данными из чанка.
     * ИСПРАВЛЕНО: Использует реальные AABB примитивов вместо математических формул.
     */
    updateHeightMapForChunk(chunkData) {
        if (!this.config || !this.config.chunkSize || !this.config.gridSize) return;
        
        const cellSize = this.config.chunkSize / this.config.gridSize;
        let recordsUpdated = 0;

        for (const prim of chunkData) {
            // Фильтруем только проходимые объекты
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen') continue;
            if (prim.type === 'cable' || prim.type === 'l_cable') continue; 
            if (prim.type === 'torus') continue;
            
            // Проверяем проходимость через единую функцию
            const isWalkable = 
                prim.type === 'box' || 
                prim.type.includes('stair') || 
                prim.type.includes('bridge') ||
                prim.type === 'platform_stair' ||
                prim.type === 'arch'; // Арки тоже могут быть проходимы сверху
                
            if (!isWalkable) continue;

            // === ИСПРАВЛЕНИЕ: Расчет реальной верхней границы через AABB ===
            // Для сложных фигур (лестницы, мосты) position.y - это центр, 
            // а scale.y может не соответствовать реальной высоте из-за наклона/составной геометрии.
            // Мы используем приближенную оценку на основе типа, если точный AABB недоступен в PrimitiveRecord.
            
            let topY = prim.position.y;
            let halfW = Math.abs(prim.scale.x) / 2;
            let halfD = Math.abs(prim.scale.z) / 2;

            if (prim.type.includes('stair')) {
                // Лестница занимает всю высоту яруса от yBase до yBase + levelHeight
                // Но в примитиве yBase часто равен позиции платформы.
                // Безопаснее брать: позиция + половина высоты яруса (т.к. лестница идет вверх)
                const levelH = prim.params?.levelHeight || this.config.levelHeight;
                topY = prim.position.y + (levelH / 2); 
                // Для AABB лестницы берем полный размер клетки
                halfW = Math.abs(prim.scale.x) / 2; 
                halfD = Math.abs(prim.scale.z) / 2;
            } else if (prim.type.includes('bridge')) {
                // Мост тонкий, его topY ≈ position.y + thickness/2
                // Но в примитивах мостов scale.y часто = 1 (условная толщина), а реальная ~0.2
                // Используем platformThickness для точности
                const thick = this.config.platformThickness || 0.5;
                topY = prim.position.y + (thick / 2);
            } else {
                // Обычный бокс/платформа
                topY = prim.position.y + (Math.abs(prim.scale.y) / 2);
            }

            const isLadder = prim.type.includes('stair');

            // Вычисляем границы в сетке
            const minX = Math.floor((prim.position.x - halfW) / cellSize);
            const maxX = Math.floor((prim.position.x + halfW) / cellSize);
            const minZ = Math.floor((prim.position.z - halfD) / cellSize);
            const maxZ = Math.floor((prim.position.z + halfD) / cellSize);

            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${z}`;
                    const currentData = this.heightMap.get(key);
                    
                    // Записываем если ячейка пуста ИЛИ новый объект выше
                    if (!currentData || topY > currentData.y) {
                        this.heightMap.set(key, {
                            y: topY,
                            isLadder: isLadder,
                            type: prim.type
                        });
                        recordsUpdated++;
                    }
                }
            }
        }
        
        // console.log(`📊 HeightMap обновлена: +${recordsUpdated} записей. Всего: ${this.heightMap.size}`);
    }

    loadChunk(cx, cy, cz, config, cameraPos) {
        const key = createChunkKey(cx, cy, cz);
        let chunkData = this.cache.get(key);
        
        if (!chunkData) {
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            this.cache.set(key, chunkData);
        }

        // === ГЛАВНОЕ: Обновляем ТОЛЬКО логическую карту высот ===
        // Физические меши больше не нужны для игрока
        this.updateHeightMapForChunk(chunkData);

        // 1. Визуальный слой (остается без изменений)
        const group = this.createChunkMesh(chunkData, config);
        group.userData.primitives = chunkData; 
        
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);

        // === УДАЛЕНО: Создание collisionGroup ===
        // Раньше здесь был код createCollisionChunk, который грузил CPU/GPU
        // Теперь физика работает исключительно через heightMap
        
        // Экраны
        if (this.sceneManager.screenManager) {
            this.registerScreens(chunkData, key, config);
        }
    }

    registerScreens(primitives, chunkKey, config) {
        const screenManager = this.sceneManager.screenManager;
        if (!screenManager) return;
        for (let i = 0; i < primitives.length; i++) {
            const prim = primitives[i];
            if (prim.type === 'screen') {
                screenManager.addScreen(
                    `${chunkKey}_screen_${i}`,
                    prim.position,
                    prim.rotation,
                    prim.scale,
                    prim.screenType || 'monitor'
                );
            }
        }
    }

    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        const cameraPos = this.sceneManager.camera.position;
        
        const grouped = this.groupPrimitives(primitives);
        
        for (const [typeSlot, items] of Object.entries(grouped)) {
            const lastPipeIndex = typeSlot.lastIndexOf('|');
            if (lastPipeIndex === -1) continue;
            
            const slot = typeSlot.substring(lastPipeIndex + 1);
            const fullType = typeSlot.substring(0, lastPipeIndex);
            
            if (fullType === 'screen') continue;

            // Быстрый расчет дистанции до первого элемента группы для LOD
            const item = items[0];
            const dx = item.position.x - cameraPos.x;
            const dy = item.position.y - cameraPos.y;
            const dz = item.position.z - cameraPos.z;
            const distSq = dx*dx + dy*dy + dz*dz;

            // === ЖЕСТКАЯ ФИЛЬТРАЦИЯ ДЛЯ FPS (LOD) ===
            
            // 1. Скрываем весь декор, кабели и тяжелые фигуры дальше 150 единиц
            if (distSq > 22500) { // 150^2
                if (slot === 'decor' || slot === 'micro') continue;
                if (fullType === 'cable' || fullType === 'l_cable') continue;
                if (fullType === 'sphere' || fullType === 'torus') continue;
            }

            // 2. Скрываем микро-декор ближе, но все же далеко (> 100 единиц)
            if (distSq > 10000) { // 100^2
                if (slot === 'micro') continue;
            }

            const mesh = this.createInstancedMesh(fullType, slot, items, config);
            if (mesh) group.add(mesh);
        }
        return group;
    }

    groupPrimitives(primitives) {
        const grouped = {};
        for (const prim of primitives) {
            if (!prim.type || !prim.position) continue;
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
        const geometry = this.createGeometry(type, slot, config, items[0]);
        const material = new THREE.MeshLambertMaterial({
            color: new THREE.Color(colorHex), flatShading: true, side: THREE.DoubleSide
        });
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        mesh.frustumCulled = true; 
        const dummy = new THREE.Object3D();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            dummy.position.set(item.position?.x ?? 0, item.position?.y ?? 0, item.position?.z ?? 0);
            const rotY = THREE.MathUtils.degToRad(item.rotation?.tiltY || 0);
            const rotZ = THREE.MathUtils.degToRad(item.rotation?.twistZ || 0);
            const rotX = THREE.MathUtils.degToRad(item.rotation?.tiltX || 0);
            dummy.rotation.set(rotX, rotY, rotZ);
            dummy.scale.set(item.scale?.x ?? 1, item.scale?.y ?? 1, item.scale?.z ?? 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    createGeometry(type, variant, config, item = null) {
        // === ОПТИМИЗАЦИЯ: Жестко ограничиваем сложность базовых фигур (Low Poly) ===
        
        switch (type) {
            // --- ПРОСТЫЕ ФИГУРЫ (Box-like) ---
            case 'box': 
            case 'mega_block':
                return new THREE.BoxGeometry(1, 1, 1);

            // --- КРУГЛЫЕ ФИГУРЫ (Минимум сегментов) ---
            case 'cylinder': 
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
            
            case 'cone': 
                return new THREE.ConeGeometry(0.5, 1, 8);
            
            case 'obelisk': 
                return new THREE.ConeGeometry(0.4, 1, 4); 
            
            case 'spire': 
                return new THREE.ConeGeometry(0.2, 1, 6);

            case 'sphere': 
                return new THREE.SphereGeometry(0.5, 12, 8);

            case 'capsule': 
                return new THREE.CapsuleGeometry(0.5, 1, 2, 8);

            case 'torus': 
                return new THREE.TorusGeometry(0.5, 0.15, 6, 8);

            case 'octahedron': 
                return new THREE.OctahedronGeometry(0.5);

            // --- СПЕЦИАЛЬНЫЕ / СОСТАВНЫЕ ---
            case 'l_cable': 
                if (typeof createLCableGeometry === 'function') {
                    return createLCableGeometry();
                }
                return new THREE.BoxGeometry(0.1, 1, 0.1);

            case 'stair_north': 
            case 'stair_south': 
            case 'stair_east': 
            case 'stair_west':
            case 'bridge_ns': 
            case 'bridge_ew':
                if (typeof getStairGeometry === 'function') {
                    const p = item?.params || {};
                    return getStairGeometry(
                        type, 
                        p.platformThickness || config.platformThickness, 
                        p.levelHeight || config.levelHeight
                    );
                }
                return new THREE.BoxGeometry(1, 1, 1);

            case 'platform_stair':
                if (typeof getStairGeometry === 'function') {
                    return getStairGeometry(`stair_${variant || 'east'}`);
                }
                return new THREE.BoxGeometry(1, 1, 1);

            case 'arch':
                if (typeof getStairGeometry === 'function') {
                    return getStairGeometry('arch');
                }
                return new THREE.BoxGeometry(1, 1, 1);

            // --- DEFAULT ---
            default: 
                return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                
                // === УДАЛЕНО: Очистка collisionGroup ===
                // Так как мы больше не создаем физические меши, 
                // удалять их из сцены и памяти не нужно
                
                if (this.sceneManager.screenManager) {
                    this.unregisterScreens(key);
                }
                
                this.activeChunks.delete(key);
            }
        }
    }

    unregisterScreens(chunkKey) {
        const screenManager = this.sceneManager.screenManager;
        if (!screenManager) return;
        for (const [screenKey] of screenManager.activeScreens) {
            if (screenKey.startsWith(chunkKey)) screenManager.removeScreen(screenKey);
        }
    }

    disposeChunk(chunk) {
        chunk.traverse((child) => {
            if (child.isInstancedMesh || child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
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
        this.heightMap.clear();
        this.lastCameraChunk = null;
        if (this.sceneManager.screenManager) this.sceneManager.screenManager.clearAll();
        console.log('🧹 All chunks cleared');
    }
}

export default ChunkManager;

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
        // 1. СНАЧАЛА вычисляем константы
        const { viewChunksXY, viewChunksZ, chunkSize, maxRenderDistance = 300 } = config;
        const maxDistSq = maxRenderDistance * maxRenderDistance;
        
        const desiredChunks = new Set();

        for (let dx = -viewChunksXY; dx <= viewChunksXY; dx++) {
            for (let dy = -viewChunksXY; dy <= viewChunksXY; dy++) {
                for (let dz = -viewChunksZ; dz <= viewChunksZ; dz++) {
                    const cx = centerChunk.cx + dx;
                    const cy = centerChunk.cy + dy;
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
     * Использует единую функцию isWalkablePrimitive.
     */
    updateHeightMapForChunk(chunkData) {
        if (!this.config) return;
        const cellSize = this.config.chunkSize / this.config.gridSize;
        
        for (const prim of chunkData) {
            if (!isWalkablePrimitive(prim)) continue;
            
            // Вычисляем AABB примитива в координатах сетки
            const halfW = Math.abs(prim.scale.x) / 2;
            const halfD = Math.abs(prim.scale.z) / 2;
            
            const minX = Math.floor((prim.position.x - halfW) / cellSize);
            const maxX = Math.floor((prim.position.x + halfW) / cellSize);
            const minZ = Math.floor((prim.position.z - halfD) / cellSize);
            const maxZ = Math.floor((prim.position.z + halfD) / cellSize);
            
            // Верхняя грань объекта
            const topY = prim.position.y + (Math.abs(prim.scale.y) / 2);
            const isLadder = prim.type.includes('stair');

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
                    }
                }
            }
        }
    }

    loadChunk(cx, cy, cz, config, cameraPos) {
        const key = createChunkKey(cx, cy, cz);
        let chunkData = this.cache.get(key);
        
        if (!chunkData) {
            chunkData = generateChunk(cx, cy, cz, config.seed, config);
            this.cache.set(key, chunkData);
        }

        this.updateHeightMapForChunk(chunkData);

        // 1. Визуальный слой
        const group = this.createChunkMesh(chunkData, config);
        group.userData.primitives = chunkData; 
        
        this.activeChunks.set(key, group);
        this.sceneManager.scene.add(group);

        // 2. Физический слой (коллизии)
        /*
        const collisionGroup = this.createCollisionChunk(chunkData, config);
        collisionGroup.name = `Collision_${key}`;
        
        if (this.sceneManager.collisionLayer) {
            this.sceneManager.collisionLayer.add(collisionGroup);
        }
        
        group.userData.collisionGroup = collisionGroup; */

        // 3. Экраны (анимированные текстуры)
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

    /**
     * Создает физические коллайдеры для чанка.
     * Использует ту же логику фильтрации, что и heightMap.
     */
    createCollisionChunk(primitives, config) {
        const group = new THREE.Group();
        // Невидимый материал для коллайдеров
        const debugMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            visible: false,
            side: THREE.DoubleSide
        }); 
        
        for (const prim of primitives) {
            if (!isWalkablePrimitive(prim)) continue;
            
            let geometry = null;
            let isLadder = false;

            switch (prim.type) {
                case 'box':
                case 'platform_stair':
                case 'mega_block':
                    geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    break;

                case 'cylinder':
                case 'cone':
                case 'obelisk':
                case 'spire':
                case 'capsule':
                    // Для pierce-фигур используем упрощенный цилиндр/конус
                    geometry = new THREE.CylinderGeometry(
                        prim.scale.x * 0.8, // Немного уменьшаем радиус для надежности
                        prim.scale.x * 0.8, 
                        prim.scale.y, 
                        8
                    );
                    break;
                
                case 'stair_north': 
                case 'stair_south': 
                case 'stair_east': 
                case 'stair_west':
                    if (typeof getStairGeometry === 'function') {
                        const p = prim.params || {};
                        geometry = getStairGeometry(
                            prim.type, 
                            p.platformThickness || config.platformThickness, 
                            p.levelHeight || config.levelHeight
                        );
                        isLadder = true;
                    } else {
                        // Fallback на бокс если фабрика недоступна
                        geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    }
                    break;
                
                case 'bridge_ns': 
                case 'bridge_ew':
                    geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    break;

                case 'arch':
                    if (typeof getStairGeometry === 'function') {
                        geometry = getStairGeometry('arch');
                    } else {
                        geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    }
                    break;
                    
                default: 
                    // Для любых других walkable-типов создаем бокс по габаритам
                    geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    break;
            }

            if (geometry) {
                // КРИТИЧНО: Вычисляем bounding box ДО трансформаций
                geometry.computeBoundingBox();

                const mesh = new THREE.Mesh(geometry, debugMaterial);
                mesh.position.set(prim.position.x, prim.position.y, prim.position.z);
                
                if (prim.rotation) {
                    mesh.rotation.x = THREE.MathUtils.degToRad(prim.rotation.tiltX || 0);
                    mesh.rotation.y = THREE.MathUtils.degToRad(prim.rotation.tiltY || 0);
                    mesh.rotation.z = THREE.MathUtils.degToRad(prim.rotation.twistZ || 0);
                }
                
                // Обновляем матрицы для корректной работы Raycaster
                mesh.updateMatrix();
                mesh.updateMatrixWorld(true);
                
                mesh.userData.isLadder = isLadder;
                mesh.userData.type = prim.type;
                group.add(mesh);
            }
        }
        return group;
    }

// src/world/chunkManager.js
// src/world/chunkManager.js

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

            // Быстрый расчет дистанции до первого элемента группы
            const item = items[0];
            const dx = item.position.x - cameraPos.x;
            const dy = item.position.y - cameraPos.y;
            const dz = item.position.z - cameraPos.z;
            const distSq = dx*dx + dy*dy + dz*dz;

            // === ЖЕСТКАЯ ФИЛЬТРАЦИЯ ДЛЯ FPS ===
            
            // 1. Скрываем весь декор и кабели дальше 150 единиц
            if (distSq > 22500) { // 150^2
                if (slot === 'decor' || slot === 'micro') continue;
                if (fullType === 'cable' || fullType === 'l_cable') continue;
                if (fullType === 'sphere' || fullType === 'torus') continue; // Тяжелые фигуры
            }

            // 2. Скрываем микро-декор ближе, но все же далеко
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
        const geometry = this.createGeometry(type, null, config, items[0]);
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
        // === ОПТИМИЗАЦИЯ: Жестко ограничиваем сложность базовых фигур ===
        // Для стиля Blame! "граненость" даже желательна, а лишние полигоны убивают FPS.
        
        switch (type) {
            // --- ПРОСТЫЕ ФИГУРЫ (Box-like) ---
            case 'box': 
            case 'mega_block':
                return new THREE.BoxGeometry(1, 1, 1);

            // --- КРУГЛЫЕ ФИГУРЫ (Low Poly) ---
            case 'cylinder': 
                // 8 сегментов достаточно для индустриального стиля
                return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
            
            case 'cone': 
                return new THREE.ConeGeometry(0.5, 1, 8);
            
            case 'obelisk': 
                // 4 грани (пирамида/квадратная колонна)
                return new THREE.ConeGeometry(0.4, 1, 4); 
            
            case 'spire': 
                // Острый шпиль, 6 граней
                return new THREE.ConeGeometry(0.2, 1, 6);

            case 'sphere': 
                // 12x8 сегментов вместо 16x16 или больше
                return new THREE.SphereGeometry(0.5, 12, 8);

            case 'capsule': 
                // Capsule тяжелая, заменяем на упрощенную версию или оставляем минимум
                // radiusTop, radiusBottom, length, capSegments, radialSegments
                return new THREE.CapsuleGeometry(0.5, 1, 2, 8);

            case 'torus': 
                // Минимально возможное качество для декоративных колец
                // radius, tube, radialSegments, tubularSegments
                return new THREE.TorusGeometry(0.5, 0.15, 6, 12);

            case 'octahedron': 
                return new THREE.OctahedronGeometry(0.5);

            // --- СПЕЦИАЛЬНЫЕ / СОСТАВНЫЕ ---
            case 'l_cable': 
                if (typeof createLCableGeometry === 'function') {
                    return createLCableGeometry();
                }
                // Fallback: простой тонкий бокс
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
                // Fallback для арки: два столба и перекладина (упрощенно боксом)
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
                
                // Удаляем физическую группу
                if (chunk.userData.collisionGroup) {
                    if (this.sceneManager.collisionLayer) {
                        this.sceneManager.collisionLayer.remove(chunk.userData.collisionGroup);
                    }
                    // Чистим геометрию коллайдеров
                    chunk.userData.collisionGroup.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) child.material.dispose();
                    });
                }
                
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

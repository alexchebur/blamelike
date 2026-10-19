
// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk, parseChunkKey } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getStairGeometry } from '../geom/stairFactory.js';
import { createLCableGeometry } from '../geom/meshFactory.js';

/**
 * Определяет, является ли примитив проходимым (опорой для игрока).
 * Используется для HeightMap и фильтрации физических тел.
 * @param {Object} prim - PrimitiveRecord
 * @returns {boolean}
 */
function isWalkablePrimitive(prim) {
    if (!prim || !prim.type) return false;
    if (prim.role === 'decor' || prim.role === 'micro') return false;
    if (prim.type === 'screen') return false;
    if (prim.type === 'cable' || prim.type === 'l_cable') return false;
    if (prim.type === 'torus') return false;
    
    // box, stair_*, bridge_*, platform_stair, arch, cylinder, cone...
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

    findSpawnPoint(center, radius = 1) {
        if (!this.config) return null;
        
        const cx = Math.floor(center.x / this.config.chunkSize);
        const cy = Math.floor(center.y / this.config.chunkSize);
        const cz = Math.floor(center.z / this.config.chunkSize);

        const cellSize = this.config.chunkSize / this.config.gridSize;
        const gridX = Math.floor(center.x / cellSize);
        const gridZ = Math.floor(center.z / cellSize);
        
        // Сначала ищем через heightMap (быстро)
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

        // Fallback: поиск через примитивы чанков
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

    getLogicalHeight(x, z) {
        if (!this.config) return null;
        const cellSize = this.config.chunkSize / this.config.gridSize;
        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        return this.heightMap.get(key) || null;
    }

    updateHeightMapForChunk(chunkData) {
        if (!this.config || !chunkData) return;
        const cellSize = this.config.chunkSize / this.config.gridSize;
        
        for (const prim of chunkData) {
            if (!isWalkablePrimitive(prim)) continue;
            
            // Защита от отсутствующих scale
            const sx = prim.scale?.x ?? 1;
            const sz = prim.scale?.z ?? 1;
            
            const halfW = Math.abs(sx) / 2;
            const halfD = Math.abs(sz) / 2;
            
            const minX = Math.floor((prim.position.x - halfW) / cellSize);
            const maxX = Math.floor((prim.position.x + halfW) / cellSize);
            const minZ = Math.floor((prim.position.z - halfD) / cellSize);
            const maxZ = Math.floor((prim.position.z + halfD) / cellSize);
            
            const topY = prim.position.y + (Math.abs(prim.scale?.y ?? 1) / 2);
            const isLadder = prim.type.includes('stair');

            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x},${z}`;
                    const currentData = this.heightMap.get(key);
                    
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

// src/world/chunkManager.js

// ... импорты ...

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

        // 2. Физический слой (RAYCAST + INSTANCED MESH) - ОПТИМИЗИРОВАННО
        if (this.sceneManager.collisionLayer) {
            // Фильтруем только проходимые объекты
            const walkablePrims = chunkData.filter(p => {
                if (p.role === 'decor' || p.role === 'micro') return false;
                if (p.type === 'screen' || p.type === 'torus') return false;
                if (p.type.inc    loadChunk(cx, cy, cz, config, cameraPos) {
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

        // 2. Физический слой (RAYCAST + INSTANCED MESH)
        if (this.sceneManager.collisionLayer) {
            // Фильтруем только проходимые объекты
            const walkablePrims = chunkData.filter(p => {
                if (p.role === 'decor' || p.role === 'micro') return false;
                if (p.type === 'screen' || p.type === 'torus') return false;
                if (p.type.includes('cable')) return false;
                
                return p.type === 'box' || p.type.includes('stair') || 
                       p.type.includes('bridge') || p.type === 'platform_stair';
            });

            if (walkablePrims.length > 0) {
                // Базовая геометрия 1x1x1 (будет масштабироваться матрицей)
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                
                // Материал для физики (невидимый, но участвует в Raycast)
                const physicsMaterial = new THREE.MeshBasicMaterial({ 
                    visible: false,
                    colorWrite: false,
                    depthWrite: true
                });

                // Создаем InstancedMesh для всех коллайдеров чанка
                const physicsMesh = new THREE.InstancedMesh(geometry, physicsMaterial, walkablePrims.length);
                physicsMesh.name = `Physics_${key}`;
                physicsMesh.frustumCulled = false; // Важно для инстансов внутри группы
                
                // Массив для хранения типов примитивов (для проверки лестниц в PlayerController)
                const primTypes = [];
                const dummy = new THREE.Object3D();

                for (let i = 0; i < walkablePrims.length; i++) {
                    const prim = walkablePrims[i];
                    
                    // === КОРРЕКТИРОВКА РАЗМЕРОВ И ПОЗИЦИИ ДЛЯ ФИЗИКИ ===
                    let physScale = { ...prim.scale };
                    let physPos = { ...prim.position };

                    // Минимальная толщина для надежного Raycast (защита от проваливания)
                    const minThickness = 0.5; 

                    if (prim.type.includes('stair') || prim.type === 'platform_stair') {
                        // ЛЕСТНИЦЫ: Используем только толщину платформы, игнорируя высоту этажа
                        const thickness = Math.max(minThickness, config.platformThickness || 0.5);
                        // Сдвигаем центр коллайдера на половину толщины вверх от низа платформы
                        physPos.y = prim.position.y + (thickness / 2);
                        physScale.y = thickness;
                        // X и Z оставляем как есть (размер клетки)
                    } 
                    else if (prim.type === 'bridge_ns') {
                        // МОСТ СЕВЕР-ЮГ: Узкий по X, длинный по Z
                        // Геометрия в stairFactory: Box(0.2, 0.1, 1.0)
                        // Scale в генераторе: { x: cellSize, y: 1, z: cellSize }
                        // Итоговый визуальный размер: 0.2*cellSize x 0.1 x 1.0*cellSize
                        
                        const bridgeWidth = 0.2 * prim.scale.x; // Ширина моста
                        const bridgeLength = 1.0 * prim.scale.z; // Длина моста
                        const bridgeThickness = Math.max(minThickness, 0.1 * prim.scale.y); // Толщина (увеличена для физики)

                        physScale.x = bridgeWidth;
                        physScale.z = bridgeLength;
                        physScale.y = bridgeThickness;

                        // Корректировка позиции Y: центр бокса должен быть на поверхности моста
                        // В генераторе position.y = currentYBase + platformThickness + 0.05
                        // Визуальная высота моста = 0.1 * scale.y = 0.1
                        // Верхняя грань визуального моста = pos.y + 0.05
                        // Нам нужно, чтобы верхняя грань физического бокса совпадала с верхней гранью визуального
                        const visualTopY = prim.position.y + (0.1 * prim.scale.y / 2);
                        physPos.y = visualTopY - (bridgeThickness / 2);
                    }
                    else if (prim.type === 'bridge_ew') {
                        // МОСТ ВОСТОК-ЗАПАД: Длинный по X, узкий по Z
                        // Геометрия в stairFactory: Box(1.0, 0.1, 0.2)
                        
                        const bridgeLength = 1.0 * prim.scale.x; // Длина моста
                        const bridgeWidth = 0.2 * prim.scale.z;  // Ширина моста
                        const bridgeThickness = Math.max(minThickness, 0.1 * prim.scale.y); // Толщина

                        physScale.x = bridgeLength;
                        physScale.z = bridgeWidth;
                        physScale.y = bridgeThickness;

                        // Корректировка позиции Y (аналогично bridge_ns)
                        const visualTopY = prim.position.y + (0.1 * prim.scale.y / 2);
                        physPos.y = visualTopY - (bridgeThickness / 2);
                    }
                    else {
                        // ОБЫЧНЫЕ ПЛАТФОРМЫ (box)
                        // Убедимся, что толщина достаточна для Raycast
                        if (physScale.y < minThickness) {
                            const oldY = physPos.y;
                            physScale.y = minThickness;
                            // Если это тонкая плита, скорректируем позицию, чтобы верх остался на месте
                            // (предполагая, что prim.position.y - это центр)
                            // Но в генераторе для box position.y = yBase + thickness/2, так что центр уже верный.
                            // Просто увеличиваем толщину симметрично.
                        }
                    }
                    // =============================================================

                    // Устанавливаем трансформацию для инстанса
                    dummy.position.set(physPos.x, physPos.y, physPos.z);
                    dummy.rotation.set(
                        THREE.MathUtils.degToRad(prim.rotation?.tiltX || 0),
                        THREE.MathUtils.degToRad(prim.rotation?.tiltY || 0),
                        THREE.MathUtils.degToRad(prim.rotation?.twistZ || 0)
                    );
                    dummy.scale.set(
                        Math.abs(physScale.x), 
                        Math.abs(physScale.y), 
                        Math.abs(physScale.z)
                    );
                    dummy.updateMatrix();
                    
                    physicsMesh.setMatrixAt(i, dummy.matrix);
                    primTypes.push(prim.type); // Сохраняем тип для проверки isLadder
                }
                
                physicsMesh.instanceMatrix.needsUpdate = true;
                // Сохраняем типы в userData, чтобы PlayerController мог их читать
                physicsMesh.userData.primTypes = primTypes; 

                // Добавляем невидимый меш в слой коллизий
                this.sceneManager.collisionLayer.add(physicsMesh);
                
                // === DEBUG VISUALS (если включено) ===
                let debugMesh = null;
                if (config.debugPhysics) {
                    const debugMaterial = new THREE.MeshBasicMaterial({ 
                        color: 0x00ff88, 
                        wireframe: true,
                        transparent: true,
                        opacity: 0.3
                    });
                    
                    debugMesh = new THREE.InstancedMesh(geometry, debugMaterial, walkablePrims.length);
                    debugMesh.name = `Debug_${key}`;
                    debugMesh.frustumCulled = false;
                    
                    // Копируем матрицы из физического меша
                    debugMesh.instanceMatrix.copy(physicsMesh.instanceMatrix);
                    
                    // Отключаем Raycast для дебаг-меша, чтобы он не мешал физике
                    debugMesh.raycast = () => {}; 
                    
                    this.sceneManager.scene.add(debugMesh);
                }

                // Сохраняем ссылки для удаления при выгрузке чанка
                group.userData.physicsMesh = physicsMesh;
                if (debugMesh) group.userData.debugMesh = debugMesh;
            }
        }

        // 3. Экраны
        if (this.sceneManager.screenManager) {
            this.registerScreens(chunkData, key, config);
        }
    }
    
    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                // Удаляем визуальный меш
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                
                // === УДАЛЕНИЕ ФИЗИЧЕСКОГО СЛОЯ (RAYCAST) ===
                if (chunk.userData.collisionMesh && this.sceneManager.collisionLayer) {
                    this.sceneManager.collisionLayer.remove(chunk.userData.collisionMesh);
                    chunk.userData.collisionMesh.geometry.dispose();
                    chunk.userData.collisionMesh.material.dispose();
                }
                // ==========================================
                
                // Удаляем из HeightMap (ваш существующий код)
                if (chunk.userData.primitives && this.config) {
                     // ... (код очистки heightMap остается без изменений) ...
                     const cellSize = this.config.chunkSize / this.config.gridSize;
                     for (const prim of chunk.userData.primitives) {
                        if (!isWalkablePrimitive(prim)) continue;
                        const sx = prim.scale?.x ?? 1;
                        const sz = prim.scale?.z ?? 1;
                        const halfW = Math.abs(sx) / 2;
                        const halfD = Math.abs(sz) / 2;
                        const minX = Math.floor((prim.position.x - halfW) / cellSize);
                        const maxX = Math.floor((prim.position.x + halfW) / cellSize);
                        const minZ = Math.floor((prim.position.z - halfD) / cellSize);
                        const maxZ = Math.floor((prim.position.z + halfD) / cellSize);
                        const topY = prim.position.y + (Math.abs(prim.scale?.y ?? 1) / 2);
                        for (let x = minX; x <= maxX; x++) {
                            for (let z = minZ; z <= maxZ; z++) {
                                const mapKey = `${x},${z}`;
                                const existing = this.heightMap.get(mapKey);
                                if (existing && Math.abs(existing.y - topY) < 0.1) {
                                    this.heightMap.delete(mapKey);
                                }
                            }
                        }
                    }
                }

                if (this.sceneManager.screenManager) {
                    this.unregisterScreens(key);
                }
                
                this.activeChunks.delete(key);
            }
        }
    }
    
    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                // === КРИТИЧЕСКОЕ: Удаляем данные чанка из HeightMap ===
                // Иначе старые платформы продолжают удерживать игрока
                if (chunk.userData.primitives && this.config) {
                    const cellSize = this.config.chunkSize / this.config.gridSize;
                    for (const prim of chunk.userData.primitives) {
                        if (!isWalkablePrimitive(prim)) continue;
                        
                        const sx = prim.scale?.x ?? 1;
                        const sz = prim.scale?.z ?? 1;
                        const halfW = Math.abs(sx) / 2;
                        const halfD = Math.abs(sz) / 2;
                        
                        const minX = Math.floor((prim.position.x - halfW) / cellSize);
                        const maxX = Math.floor((prim.position.x + halfW) / cellSize);
                        const minZ = Math.floor((prim.position.z - halfD) / cellSize);
                        const maxZ = Math.floor((prim.position.z + halfD) / cellSize);
                        
                        const topY = prim.position.y + (Math.abs(prim.scale?.y ?? 1) / 2);

                        for (let x = minX; x <= maxX; x++) {
                            for (let z = minZ; z <= maxZ; z++) {
                                const mapKey = `${x},${z}`;
                                const existing = this.heightMap.get(mapKey);
                                // Удаляем запись только если она принадлежит этому чанку (совпадает по высоте)
                                if (existing && Math.abs(existing.y - topY) < 0.1) {
                                    this.heightMap.delete(mapKey);
                                }
                            }
                        }
                    }
                }
                // ==================================================

                // Удаляем визуальный меш
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                
                // Удаление физического слоя
                if (chunk.userData.physicsMesh && this.sceneManager.collisionLayer) {
                    this.sceneManager.collisionLayer.remove(chunk.userData.physicsMesh);
                    chunk.userData.physicsMesh.geometry.dispose();
                    chunk.userData.physicsMesh.material.dispose();
                }
                
                // Удаление Debug слоя
                if (chunk.userData.debugMesh) {
                    this.sceneManager.scene.remove(chunk.userData.debugMesh);
                    chunk.userData.debugMesh.geometry.dispose();
                    chunk.userData.debugMesh.material.dispose();
                }
                
                if (this.sceneManager.screenManager) {
                    this.unregisterScreens(key);
                }
                
                this.activeChunks.delete(key);
            }
        }
    }

    registerScreens(primitives, chunkKey, config) {
        const screenManager = this.sceneManager.screenManager;
        if (!screenManager || !primitives) return;
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

            const item = items[0];
            if (!item || !item.position) continue;
            
            const dx = item.position.x - cameraPos.x;
            const dy = item.position.y - cameraPos.y;
            const dz = item.position.z - cameraPos.z;
            const distSq = dx*dx + dy*dy + dz*dz;

            // LOD фильтрация
            if (distSq > 22500) { // 150^2
                if (slot === 'decor' || slot === 'micro') continue;
                if (fullType === 'cable' || fullType === 'l_cable') continue;
                if (fullType === 'sphere' || fullType === 'torus') continue;
            }

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
        if (!primitives) return grouped;
        
        for (const prim of primitives) {
            if (!prim || !prim.type || !prim.position) continue;
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
        switch (type) {
            case 'box': 
            case 'mega_block':
                return new THREE.BoxGeometry(1, 1, 1);
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
                return new THREE.TorusGeometry(0.5, 0.15, 6, 12);
            case 'octahedron': 
                return new THREE.OctahedronGeometry(0.5);
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
            default: 
                return new THREE.BoxGeometry(1, 1, 1);
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
        if (!chunk) return;
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
        
        // Очищаем физический мир
        if (this.sceneManager.physicsManager) {
            this.sceneManager.physicsManager.clear();
        }

        if (this.sceneManager.screenManager) this.sceneManager.screenManager.clearAll();
        console.log('🧹 All chunks cleared');
    }
}

export default ChunkManager;


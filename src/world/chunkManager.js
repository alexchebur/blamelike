// src/world/chunkManager.js
// @ts-check
import * as THREE from 'three';
import { createChunkKey, worldToChunk } from '../core/chunkKey.js';
import { generateChunk } from '../gen/chunkGenerator.js';
import ChunkCache from './chunkCache.js';
import { palettes } from '../core/config.js';
import { getStairGeometry } from '../geom/stairFactory.js';
import { createLCableGeometry } from '../geom/meshFactory.js';

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
        const desiredChunks = new Set();
        const maxDistSq = maxRenderDistance * maxRenderDistance;

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
        // 2. Создаем слой коллизий для этого чанка
        const collisionGroup = this.createCollisionChunk(chunkData, config);
        collisionGroup.name = `Collision_${key}`;
        this.sceneManager.collisionLayer.add(collisionGroup);
        
        // Сохраняем ссылку на коллизию, чтобы удалить при выгрузке
        // Можно хранить в activeChunks вместе с визуалом, например { visual: group, collision: collisionGroup }
        // Для простоты добавим свойство к группе или отдельный Map
        this.activeChunks.get(key).userData.collisionGroup = collisionGroup; 
        
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
    createCollisionChunk(primitives, config) {
        const group = new THREE.Group();
        
        // Материал не важен, он невидимый, но можно сделать wireframe для отладки
        const debugMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false }); 
        
        for (const prim of primitives) {
            // Пропускаем декор, который не должен быть коллайдером
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen') continue;
            if (prim.type === 'cable' || prim.type === 'l_cable') continue; // Кабели не коллайдеры
            if (prim.type === 'torus') continue;

            let geometry = null;
            let isLadder = false;

            // Выбираем геометрию для коллизии
            switch (prim.type) {
                case 'box':
                case 'platform_stair': // Платформа со ступеньками считается просто коробкой для простоты? Нет, лучше точно.
                    geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    break;
                case 'cylinder':
                case 'cone':
                case 'obelisk':
                case 'spire':
                    // Для вертикальных препятствий используем Box для простоты расчетов или Cylinder
                    geometry = new THREE.CylinderGeometry(prim.scale.x, prim.scale.x, prim.scale.y, 8);
                    break;
                case 'stair_north':
                case 'stair_south':
                case 'stair_east':
                case 'stair_west':
                    // ЛЕСТНИЦА: Создаем наклонный бокс или набор боксов
                    // Для простоты и производительности сделаем один наклонный Box
                    // Но лучше использовать ту же геометрию, что и в stairFactory, но упрощенную
                    geometry = this.getStairCollisionGeometry(prim.type, config);
                    isLadder = true;
                    break;
                case 'bridge_ns':
                case 'bridge_ew':
                    geometry = new THREE.BoxGeometry(prim.scale.x, prim.scale.y, prim.scale.z);
                    break;
                default:
                    continue;
            }

            if (geometry) {
                const mesh = new THREE.Mesh(geometry, debugMaterial);
                mesh.position.set(prim.position.x, prim.position.y, prim.position.z);
                
                // Поворот
                if (prim.rotation) {
                    mesh.rotation.x = THREE.MathUtils.degToRad(prim.rotation.tiltX || 0);
                    mesh.rotation.y = THREE.MathUtils.degToRad(prim.rotation.tiltY || 0);
                    mesh.rotation.z = THREE.MathUtils.degToRad(prim.rotation.twistZ || 0);
                }
                
                mesh.userData.isLadder = isLadder;
                mesh.userData.type = prim.type;
                
                group.add(mesh);
            }
        }
        return group;
    }

    getStairCollisionGeometry(type, config) {
        // Возвращает упрощенную геометрию лестницы для коллизий
        // В идеале это должен быть один наклонный Box, покрывающий весь пролет
        // Высота подъема = levelHeight
        // Длина пролета зависит от типа
        
        const h = config.levelHeight;
        const w = config.chunkSize / config.gridSize * 0.4; // Ширина лестницы
        
        // Для простоты создадим Box, повернутый под углом 45 градусов (примерно)
        // Точный угол зависит от длины. Пусть длина будет 2 * cellSize
        const len = (config.chunkSize / config.gridSize) * 2; 
        const thickness = 0.5;
        
        const geo = new THREE.BoxGeometry(len, thickness, w);
        
        // Смещаем центр, чтобы pivot был внизу
        // И поворачиваем
        const angle = Math.atan(h / len);
        geo.rotateX(angle);
        geo.translate(0, h/2, 0); // Поднимаем, чтобы низ был на 0
        
        return geo;
    }
    createChunkMesh(primitives, config) {
        const group = new THREE.Group();
        const grouped = this.groupPrimitives(primitives);

        for (const [typeSlot, items] of Object.entries(grouped)) {
            const lastPipeIndex = typeSlot.lastIndexOf('|');
            if (lastPipeIndex === -1) continue;
            
            const slot = typeSlot.substring(lastPipeIndex + 1);
            const fullType = typeSlot.substring(0, lastPipeIndex);
            if (fullType === 'screen') continue;
            
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
            
            // Позиция
            dummy.position.set(
                item.position?.x ?? 0, 
                item.position?.y ?? 0, 
                item.position?.z ?? 0
            );
            
            // Поворот: используем tiltY для направления и twistZ для угла изгиба
            // Для обычных объектов tiltY=0, для l_cable tiltY=azimuthDeg
            const rotY = THREE.MathUtils.degToRad(item.rotation?.tiltY || 0);
            const rotZ = THREE.MathUtils.degToRad(item.rotation?.twistZ || 0);
            const rotX = THREE.MathUtils.degToRad(item.rotation?.tiltX || 0);
            
            dummy.rotation.set(rotX, rotY, rotZ);

            // Масштаб: для l_cable scale.y/z - это толщина, scale.x - длина
            // Для остальных типов - обычный масштаб
            dummy.scale.set(
                item.scale?.x ?? 1, 
                item.scale?.y ?? 1, 
                item.scale?.z ?? 1
            );
            
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    createGeometry(type, variant, config, item = null) {
        const segments = config.maxSegments || 16;
        switch (type) {
            case 'box': return new THREE.BoxGeometry(1, 1, 1);
            case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, segments);
            case 'cone': return new THREE.ConeGeometry(0.5, 1, segments);
            case 'octahedron': return new THREE.OctahedronGeometry(0.5);
            case 'capsule': return new THREE.CapsuleGeometry(0.5, 1, 4, 8, segments);
            case 'torus': return new THREE.TorusGeometry(0.5, 0.2, 8, segments);
            case 'sphere': return new THREE.SphereGeometry(0.5, segments, segments);
            case 'obelisk': return new THREE.ConeGeometry(0.4, 1, 4); 
            case 'spire': return new THREE.ConeGeometry(0.2, 1, 8);
            case 'l_cable': return createLCableGeometry();
            
            case 'stair_north': case 'stair_south': case 'stair_east': case 'stair_west':
            case 'bridge_ns': case 'bridge_ew':
                if (typeof getStairGeometry !== 'undefined') {
                    const p = item?.params || {};
                    return getStairGeometry(type, p.platformThickness || config.platformThickness, p.levelHeight || config.levelHeight);
                }
                return new THREE.BoxGeometry(1, 1, 1);
            
            case 'platform_stair':
                if (typeof getStairGeometry !== 'undefined') return getStairGeometry(`stair_${variant || 'east'}`);
                return new THREE.BoxGeometry(1, 1, 1);
                
            case 'arch':
                 if (typeof getStairGeometry !== 'undefined') return getStairGeometry('arch');
                return new THREE.BoxGeometry(1, 1, 1);

            default: return new THREE.BoxGeometry(1, 1, 1);
        }
    }

    unloadUnusedChunks(desiredKeys) {
        for (const [key, chunk] of this.activeChunks) {
            if (!desiredKeys.has(key)) {
                // Удаляем визуал
                this.sceneManager.scene.remove(chunk);
                this.disposeChunk(chunk);
                
                // Удаляем коллизию
                if (chunk.userData.collisionGroup) {
                    this.sceneManager.collisionLayer.remove(chunk.userData.collisionGroup);
                    // Dispose геометрии коллизии
                    chunk.userData.collisionGroup.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                    });
                }
                
                // ... экраны ...
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
        if (this.sceneManager.screenManager) this.sceneManager.screenManager.clearAll();
        console.log(' All chunks cleared');
    }
}

export default ChunkManager;

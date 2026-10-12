// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.isFalling = false;
        this.onLadder = false;
        
        // Управление
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Параметры
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = 15.0; 
        this.fallSpeed = config.fallSpeed || 25; 
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // === DEBUG VARIABLES FOR UI ===
        // Эти значения будут отображаться в Physics Debug HUD
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = 0;
        this.debugChunkLoaded = false;
        // ==============================
    }

    // Этот метод теперь пустой, так как мы больше не используем кэш мешей
    updateCollisionCache() {}

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);

        // 1. Горизонтальное движение
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const moveSpeed = this.speed * dt;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        
        const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
        const moveVec = new THREE.Vector3();
        
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z * moveSpeed);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x * moveSpeed);

        const nextX = this.position.x + moveVec.x;
        const nextZ = this.position.z + moveVec.z;

        // 2. Проверка пола через HeightMap (МГНОВЕННО, БЕЗ RAYCASTING)
        this.checkGroundViaHeightMap(nextX, nextZ);

        // 3. Вертикальное движение
        let targetY = this.position.y;
        if (this.onGround) {
            this.isFalling = false;
            // Логика лестниц
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
        } else {
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGroundViaHeightMap(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const cm = this.sceneManager.chunkManager;
        
        // Сброс debug-значений по умолчанию
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = cm?.heightMap?.size || 0;
        this.debugChunkLoaded = false;

        // === ПРОВЕРКА НАЛИЧИЯ МЕНЕДЖЕРА И КАРТЫ ===
        if (!cm) {
            console.warn("❌ ChunkManager отсутствует!");
            return;
        }
        if (!cm.heightMap) {
            console.warn("❌ HeightMap отсутствует!");
            return;
        }
        if (!cm.config || !cm.config.chunkSize || !cm.config.gridSize) {
            console.warn("❌ Config в ChunkManager неполный! cellSize не может быть рассчитан.");
            return;
        }
        // ==========================================

        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        this.debugCellSize = cellSize.toFixed(2);

        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        this.debugGridKey = key;
        
        // === ПРОВЕРКА НАЛИЧИЯ ЧАНКА ПОД НОГАМИ ===
        // Определяем координаты чанка, в котором находится игрок
        const chunkX = Math.floor(x / cm.config.chunkSize);
        const chunkZ = Math.floor(z / cm.config.chunkSize);
        // Для Y используем текущую позицию, так как чанки могут быть на разных высотах
        const chunkY = Math.floor(this.position.y / cm.config.chunkSize); 
        
        // Формируем ключ чанка (предполагаем, что createChunkKey использует формат "x,y,z")
        // Если формат другой, адаптируй эту строку под свою реализацию createChunkKey
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        const activeChunk = cm.activeChunks.get(chunkKey);
        
        this.debugChunkLoaded = !!activeChunk;

        if (!activeChunk) {
            // Если чанк не загружен, heightMap точно будет пустой для этой зоны
            console.warn(`⚠️ Чанк ${chunkKey} не загружен! Игрок в пустоте.`);
            
            // СТРАХОВКА: Используем математические уровни
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 1.5) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 this.debugFloorY = `Fallback:${nearestLevelY + 1}`;
            }
            return;
        }
        // ==========================================
        
        const floorData = cm.heightMap.get(key);

        if (!floorData) {
            // Чанк загружен, но в heightMap нет данных для конкретной ячейки
            // Это значит, что под ногами игрока либо пропасть, либо объект, 
            // который не прошел фильтр isWalkablePrimitive
            
            // СТРАХОВКА: Используем математические уровни
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 1.5) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 this.debugFloorY = `Fallback:${nearestLevelY + 1}`;
            } else {
                this.debugFloorY = 'Empty Cell';
            }
            return;
        }
        // ==========================================

        const floorY = floorData.y;
        this.debugFloorY = floorY.toFixed(1);
        
        // Проверяем, находится ли игрок в зоне приземления
        if (this.position.y <= floorY + 1.5 && this.position.y >= floorY - 0.5) {
            this.onGround = true;
            this.onLadder = floorData.isLadder || false;
            this.position.y = floorY + (this.playerHeight * 0.5);
        }
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;

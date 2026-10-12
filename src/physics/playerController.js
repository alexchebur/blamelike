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

        // Debug variables for UI
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = 0;
        this.debugChunkLoaded = false;
    }

    updateCollisionCache() {} // Пустой метод для совместимости

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);

        // === SAFETY NET: Если упали слишком глубоко, телепортируем наверх ===
        if (this.position.y < -1000) {
            console.warn("⚠️ SAFETY NET: Teleporting player to Y=100");
            this.position.set(0, 100, 0);
            this.isFalling = false;
            this.onGround = true;
            return;
        }

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

        // 2. СТРОГАЯ ПРИВЯЗКА К ВЫСОТЕ ЧЕРЕЗ HEIGHTMAP
        this.checkGroundViaHeightMap(nextX, nextZ);

        // 3. Вертикальное движение
        let targetY = this.position.y;
        
        if (this.onGround) {
            this.isFalling = false;
            // Логика лестниц: если стоим на лестнице и движемся вперед/назад
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
            // Иначе Y остается жестко привязанным к полу (уже установлено в checkGroundViaHeightMap)
        } else {
            // Нет пола под ногами — применяем гравитацию
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    /**
     * СТРОГАЯ ПРИВЯЗКА К HEIGHTMAP
     * Если пол найден — жестко устанавливаем Y. Никаких условий "если близко".
     * Если пол не найден — ничего не делаем (гравитация применится в update).
     */
    checkGroundViaHeightMap(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const cm = this.sceneManager.chunkManager;
        
        // Сброс debug-значений
        this.debugFloorY = '...';
        this.debugGridKey = '...';
        this.debugCellSize = '...';
        this.debugHmSize = cm?.heightMap?.size || 0;
        this.debugChunkLoaded = false;

        if (!cm || !cm.heightMap || !cm.config || !cm.config.chunkSize || !cm.config.gridSize) {
            return;
        }

        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        this.debugCellSize = cellSize.toFixed(2);

        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        this.debugGridKey = key;
        
        // Проверяем наличие чанка под ногами
        const chunkX = Math.floor(x / cm.config.chunkSize);
        const chunkZ = Math.floor(z / cm.config.chunkSize);
        const chunkY = Math.floor(this.position.y / cm.config.chunkSize); 
        const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
        const activeChunk = cm.activeChunks.get(chunkKey);
        
        this.debugChunkLoaded = !!activeChunk;

        // Запрашиваем высоту пола из HeightMap
        const floorData = cm.heightMap.get(key);

        if (floorData) {
            // === ПОЛ НАЙДЕН: ЖЕСТКАЯ ПРИВЯЗКА ===
            const floorY = floorData.y;
            this.debugFloorY = floorY.toFixed(1);
            
            // Проверяем, что пол действительно ниже или на уровне игрока
            // (чтобы не притягивать к потолку)
            if (this.position.y >= floorY - 0.5) {
                this.onGround = true;
                this.onLadder = floorData.isLadder || false;
                
                // ЖЕСТКО устанавливаем Y
                this.position.y = floorY + (this.playerHeight * 0.5);
                
                // Логируем только при туннелировании (игрок был глубоко под полом)
                if (this.position.y - floorY < -2.0 && performance.now() % 2000 < 20) {
                    console.log(`✅ Tunneling fixed! Player was below floor. FloorY: ${floorY.toFixed(1)}`);
                }
            }
        } else {
            // === ПОЛ НЕ НАЙДЕН ===
            if (activeChunk) {
                this.debugFloorY = 'Empty Cell';
            } else {
                this.debugFloorY = 'No Chunk';
            }
            
            // Fallback: математическая страховка (если HeightMap пуста)
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            // Приземляемся только если очень близко к математическому уровню
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 1.5) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 this.debugFloorY = `Fallback:${nearestLevelY + 1}`;
            }
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

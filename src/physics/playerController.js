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
        
        // === ОТЛАДКА: Проверяем наличие менеджера и карты ===
        if (!cm) {
            console.warn("❌ ChunkManager отсутствует!");
            return;
        }
        if (!cm.heightMap) {
            console.warn("❌ HeightMap отсутствует!");
            return;
        }
        if (!cm.config) {
            console.warn("❌ Config в ChunkManager отсутствует! cellSize не может быть рассчитан.");
            return;
        }
        // ==========================================

        const cellSize = cm.config.chunkSize / cm.config.gridSize;
        const gridX = Math.floor(x / cellSize);
        const gridZ = Math.floor(z / cellSize);
        const key = `${gridX},${gridZ}`;
        
        // === ОТЛАДКА: Проверяем ключ и наличие данных ===
        // console.log(`🔍 Проверка пола: key="${key}", playerY=${this.position.y.toFixed(1)}`);
        
        const floorData = cm.heightMap.get(key);

        if (!floorData) {
            // === ОТЛАДКА: Если данных нет, проверим размер карты ===
            // console.warn(`⚠️ Нет данных в heightMap для ключа "${key}". Размер карты: ${cm.heightMap.size}`);
            
            // СТРАХОВКА: Используем математические уровни
            const levelHeight = cm.config.levelHeight || 20;
            const nearestLevelY = Math.floor((this.position.y - 2) / levelHeight) * levelHeight;
            
            if (Math.abs(this.position.y - (nearestLevelY + 1)) < 1.5) {
                 this.onGround = true;
                 this.position.y = nearestLevelY + 1 + (this.playerHeight * 0.5);
                 // console.log(`✅ Страховка сработала: приземление на уровень Y=${nearestLevelY + 1}`);
            }
            return;
        }
        // ==========================================

        const floorY = floorData.y;
        
        if (this.position.y <= floorY + 1.5 && this.position.y >= floorY - 0.5) {
            this.onGround = true;
            this.onLadder = floorData.isLadder || false;
            this.position.y = floorY + (this.playerHeight * 0.5);
            // console.log(`✅ Приземление на heightMap: Y=${floorY}`);
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

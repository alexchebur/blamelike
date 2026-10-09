// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.previousPosition = new THREE.Vector3(0, 50, 0);
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
        
        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры
        this.footRadius = 0.35; 
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = 15.0; 
        this.fallSpeed = config.fallSpeed || 25; 
        this.climbSpeed = config.ladderClimbSpeed || 6;

        // Локальный кэш коллизий
        this.localColliders = []; 
    }

    /**
     * Обновляет список коллайдеров.
     * РАДИУС 1 ЧАНК (27 чанков всего) для максимальной скорости.
     */
    updateCollisionCache(activeChunksMap, cameraPos, chunkSize) {
        this.localColliders = [];
        
        const cx = Math.floor(this.position.x / chunkSize);
        const cy = Math.floor(this.position.y / chunkSize);
        const cz = Math.floor(this.position.z / chunkSize);

        // === РАДИУС 1 ===
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const chunk = activeChunksMap.get(key);
                    
                    if (chunk && chunk.userData.collisionGroup) {
                        // Добавляем детей напрямую. 
                        // ВАЖНО: В chunkManager мы должны убедиться, что collisionGroup.children - это меши, а не вложенные группы.
                        this.localColliders.push(...chunk.userData.collisionGroup.children);
                    }
                }
            }
        }
    }

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05);

        this.previousPosition.copy(this.position);

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

        // 2. Вертикальное движение
        let targetY = this.position.y;
        if (!this.onGround) {
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        } else {
            this.isFalling = false;
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
        }

        // Временно обновляем Y для проверки
        const tempY = this.position.y;
        this.position.y = targetY;

        // 3. Проверка пола (SCANNING RAYCAST)
        this.checkGroundWithOffsets(nextX, nextZ, tempY, targetY);

        // Обновляем X и Z окончательно
        this.position.x = nextX;
        this.position.z = nextZ;

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkGroundWithOffsets(x, z, startY, endY) {
        this.onGround = false;
        this.onLadder = false;

        if (this.localColliders.length === 0) return;

        // Длина луча = пройденное расстояние + запас
        const dist = Math.abs(startY - endY) + 1.0; 
        
        // Сетка из 5 лучей (центр + углы)
        const r = this.footRadius * 0.8;
        const offsets = [
            { x: 0, z: 0 },
            { x: r, z: r }, { x: -r, z: r },
            { x: r, z: -r }, { x: -r, z: -r }
        ];

        let highestHitY = -Infinity;
        let isLadderFound = false;

        for (const offset of offsets) {
            const rayOrigin = new THREE.Vector3(x + offset.x, startY + 0.2, z + offset.z);
            
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = dist; 

            // === КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ ===
            // recursive: false, так как localColliders уже содержит плоский список мешей
            const intersects = this.raycaster.intersectObjects(this.localColliders, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                if (hit.point.y > highestHitY) {
                    highestHitY = hit.point.y;
                    isLadderFound = hit.object.userData.isLadder || false;
                }
            }
        }

        if (highestHitY > -Infinity) {
            if (highestHitY < startY) {
                this.onGround = true;
                this.isFalling = false;
                this.onLadder = isLadderFound;
                this.position.y = highestHitY + (this.playerHeight * 0.5);
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

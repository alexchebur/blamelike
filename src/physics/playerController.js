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
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Raycaster для проверки пола
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры "виртуально толстого луча" для защиты от щелей
        this.footRadius = 0.35; 
        
        this.playerHeight = config.playerHeight || 1.8;
        // Увеличенная скорость для комфортного перемещения
        this.speed = (config.moveSpeed || 50) * 3; 
        
        this.fallSpeed = config.fallSpeed || 12;
        this.climbSpeed = config.ladderClimbSpeed || 4;
    }

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

        // 2. Проверка пола через Raycast (с защитой от щелей)
        this.checkGroundWithOffsets(nextX, nextZ);

        // 3. Логика высоты
        let targetY = this.position.y;

        if (this.onGround) {
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
            // Если стоим на полу, Y был скорректирован в checkGround
        } else {
            this.isFalling = true;
            targetY -= this.fallSpeed * dt;
        }

        this.position.set(nextX, targetY, nextZ);

        // 4. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    /**
     * Проверяет наличие пола центральным лучом и 4-мя вспомогательными по углам.
     * Это решает проблему проваливания в щели между платформами.
     */
    checkGroundWithOffsets(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // Точки для проверки: центр + 4 угла квадрата вокруг игрока
        const offsets = [
            { x: 0, z: 0 },
            { x: this.footRadius, z: this.footRadius },
            { x: -this.footRadius, z: this.footRadius },
            { x: this.footRadius, z: -this.footRadius },
            { x: -this.footRadius, z: -this.footRadius }
        ];

        let highestHitY = -Infinity;
        let isLadderFound = false;
        const maxCheckDist = this.playerHeight + 0.5;

        for (const offset of offsets) {
            const rayOrigin = new THREE.Vector3(x + offset.x, this.position.y + 0.5, z + offset.z);
            this.raycaster.set(rayOrigin, this.downVector);
            this.raycaster.far = maxCheckDist;

            // recursive: true критически важен, так как коллайдеры внутри групп чанков
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Проверяем, что это пол под ногами, а не стена сбоку или потолок
                if (hit.distance < this.playerHeight * 0.8) {
                    const hitY = hit.point.y;
                    
                    // Берем самую высокую точку столкновения (ближайший пол)
                    if (hitY > highestHitY) {
                        highestHitY = hitY;
                        isLadderFound = hit.object.userData.isLadder || false;
                    }
                }
            }
        }

        // Если хоть один луч нашел землю
        if (highestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadderFound;
            
            // Жестко ставим игрока на найденную поверхность
            this.position.y = highestHitY + (this.playerHeight * 0.5);
            this.velocity.y = 0;
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

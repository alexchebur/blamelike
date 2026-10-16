// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
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
        
        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры
        this.playerRadius = 0.4; // Радиус игрока
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = config.moveSpeed || 15.0; 
        this.maxFallSpeed = 20.0; // Максимальная скорость падения
        this.gravity = 30.0; // Ускорение свободного падения
        this.climbSpeed = config.ladderClimbSpeed || 6;
        
        // Для отладки
        this.debugRay = null;
    }

    update(deltaTime, camera) {
        if (!camera) return;
        const dt = Math.min(deltaTime, 0.05); // Ограничиваем dt, чтобы избежать скачков

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

        // 2. Вертикальная физика и проверка коллизий
        this.updateVerticalPhysics(dt, nextX, nextZ);

        // Применяем горизонтальное смещение
        this.position.x = nextX;
        this.position.z = nextZ;

        // 3. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

// src/physics/playerController.js

    updateVerticalPhysics(dt, nextX, nextZ) {
        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        const feetY = this.position.y - (this.playerHeight / 2);
        let rayOriginY = feetY;
        let rayDistance = this.playerHeight + 1.0;

        if (this.isFalling) {
            const fallDistance = Math.abs(this.velocity.y * dt);
            rayOriginY = feetY + fallDistance + 0.5;
            rayDistance = fallDistance + this.playerHeight + 1.0;
        }

        const offsets = [
            { x: 0, z: 0 },
            { x: this.playerRadius, z: this.playerRadius },
            { x: -this.playerRadius, z: this.playerRadius },
            { x: this.playerRadius, z: -this.playerRadius },
            { x: -this.playerRadius, z: -this.playerRadius }
        ];

        let hitFloorY = -Infinity;
        let hitLadder = false;
        let hasHit = false;

        for (const offset of offsets) {
            const origin = new THREE.Vector3(nextX + offset.x, rayOriginY, nextZ + offset.z);
            this.raycaster.set(origin, this.downVector);
            this.raycaster.far = rayDistance;
            this.raycaster.near = 0;

            // intersectObjects теперь будет находить InstancedMesh
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, false); // false, т.к. дети - это уже меши

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Проверка на лестницу через instanceId
                if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
                    const primType = hit.object.userData.primTypes[hit.instanceId];
                    if (primType && primType.includes('stair')) {
                        hitLadder = true;
                    }
                }

                if (hit.point.y > hitFloorY) {
                    hitFloorY = hit.point.y;
                    hasHit = true;
                }
            }
        }

        if (hasHit) {
            const floorLevel = hitFloorY + (this.playerHeight / 2);
            if (this.isFalling || this.position.y <= floorLevel + 0.1) {
                this.onGround = true;
                this.isFalling = false;
                this.velocity.y = 0;
                if (Math.abs(this.position.y - floorLevel) > 0.01) {
                    this.position.y = floorLevel;
                }
            }
            this.onLadder = hitLadder;
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                this.position.y += climbDir * this.climbSpeed * dt;
                this.velocity.y = 0;
            }
        } else {
            this.onGround = false;
            this.onLadder = false;
            this.isFalling = true;
            this.velocity.y -= this.gravity * dt;
            if (this.velocity.y < -this.maxFallSpeed) {
                this.velocity.y = -this.maxFallSpeed;
            }
            this.position.y += this.velocity.y * dt;
            if (this.position.y < -100) {
                this.position.set(0, 50, 0);
                this.velocity.set(0, 0, 0);
            }
        }
    }

        // === ОБРАБОТКА РЕЗУЛЬТАТОВ ===

        if (hasHit) {
            const floorLevel = hitFloorY + (this.playerHeight / 2); // Уровень центра игрока
            
            // Если мы падали и достигли пола (или уже стоим на нем)
            if (this.isFalling || this.position.y <= floorLevel + 0.1) {
                this.onGround = true;
                this.isFalling = false;
                this.velocity.y = 0;
                
                // Жесткая привязка к полу (с небольшим допуском, чтобы не дрожать)
                if (Math.abs(this.position.y - floorLevel) > 0.01) {
                    this.position.y = floorLevel;
                }
            }
            
            this.onLadder = hitLadder;
            
            // Логика лестницы
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                this.position.y += climbDir * this.climbSpeed * dt;
                this.velocity.y = 0; // Отменяем гравитацию на лестнице
            }

        } else {
            // Пола нет -> падаем
            this.onGround = false;
            this.onLadder = false;
            this.isFalling = true;
            
            // Применяем гравитацию
            this.velocity.y -= this.gravity * dt;
            
            // Ограничиваем максимальную скорость падения
            if (this.velocity.y < -this.maxFallSpeed) {
                this.velocity.y = -this.maxFallSpeed;
            }
            
            this.position.y += this.velocity.y * dt;
            
            // Ресет при падении в бездну
            if (this.position.y < -100) {
                this.position.set(0, 50, 0);
                this.velocity.set(0, 0, 0);
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

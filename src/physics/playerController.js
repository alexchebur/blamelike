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
        
        // Параметры "толстого луча"
        this.footRadius = 0.4; // Увеличим радиус для надежности
        this.maxFallDistance = 5.0; // Увеличим дистанцию поиска
        
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.fallSpeed = config.fallSpeed || 10;
        this.climbSpeed = config.ladderClimbSpeed || 4;
        
        // Кэшируемые объекты
        this._playerBox = new THREE.Box3();
        this._tempBox = new THREE.Box3();
        this._tempVec = new THREE.Vector3();
        
        // === ВИЗУАЛИЗАЦИЯ ДЛЯ ОТЛАДКИ ===
        this.debugHelper = new THREE.Box3Helper(this._playerBox, 0x00ff00);
        this.sceneManager.scene.add(this.debugHelper);
        
        this.logCounter = 0;
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

        // 2. Проверка пола
        this.checkGroundAABB(nextX, nextZ);

        // 3. Логика высоты
        let targetY = this.position.y;

        if (this.onGround) {
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
        
        // Обновляем визуализацию бокса после изменения позиции
        this.debugHelper.visible = true;
    }

    /**
     * Рекурсивная проверка пересечений AABB
     */
    checkIntersectionsRecursive(playerBox, group, result) {
        for (const child of group.children) {
            if (child.isGroup) {
                // Если это группа (чанк), ныряем глубже
                this.checkIntersectionsRecursive(playerBox, child, result);
            } else if (child.isMesh && child.geometry) {
                // Это меш-коллайдер
                if (!child.geometry.boundingBox) {
                    child.geometry.computeBoundingBox();
                }
                
                this._tempBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);

                if (this._playerBox.intersectsBox(this._tempBox)) {
                    const colliderTopY = this._tempBox.max.y;
                    
                    // Проверяем, что это пол под нами
                    if (colliderTopY <= result.feetY + 0.5 && colliderTopY > result.closestHitY) {
                        result.closestHitY = colliderTopY;
                        result.isLadderHit = child.userData.isLadder || false;
                    }
                }
            }
        }
    }

    checkGroundAABB(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        
        this.logCounter++;
        const shouldLog = (this.logCounter % 60 === 0);

        if (!collisionLayer || collisionLayer.children.length === 0) {
            return;
        }

        // Создаем "столб" под ногами
        const feetY = this.position.y - (this.playerHeight * 0.5) + 0.1; 
        
        this._playerBox.setFromCenterAndSize(
            this._tempVec.set(x, feetY - (this.maxFallDistance / 2), z),
            this._tempVec.set(this.footRadius * 2, this.maxFallDistance, this.footRadius * 2)
        );

        // Объект для хранения результатов рекурсии
        const result = {
            closestHitY: -Infinity,
            isLadderHit: false,
            feetY: feetY,
            checkedCount: 0,
            intersectedCount: 0
        };

        // Запускаем рекурсивный обход
        this.checkIntersectionsRecursive(this._playerBox, collisionLayer, result);

        if (shouldLog) {
            console.log(`[DEBUG] Recursively checked meshes. ClosestHitY: ${result.closestHitY}`);
        }

        if (result.closestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = result.isLadderHit;
            this.position.y = result.closestHitY + (this.playerHeight * 0.5);
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

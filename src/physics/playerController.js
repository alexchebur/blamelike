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

    checkGroundAABB(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        
        // Логируем раз в 60 кадров, чтобы не спамить
        this.logCounter++;
        const shouldLog = (this.logCounter % 60 === 0);

        if (shouldLog) {
            console.log(`[DEBUG] CollisionLayer children count: ${collisionLayer ? collisionLayer.children.length : 'NULL'}`);
        }

        if (!collisionLayer || collisionLayer.children.length === 0) {
            if (shouldLog) console.warn('[DEBUG] NO COLLISION LAYER OR EMPTY!');
            return;
        }

        // Создаем "столб" под ногами
        const feetY = this.position.y - (this.playerHeight * 0.5) + 0.1; 
        
        this._playerBox.setFromCenterAndSize(
            this._tempVec.set(x, feetY - (this.maxFallDistance / 2), z),
            this._tempVec.set(this.footRadius * 2, this.maxFallDistance, this.footRadius * 2)
        );

        let closestHitY = -Infinity;
        let isLadderHit = false;
        let checkedCount = 0;
        let intersectedCount = 0;

        for (const child of collisionLayer.children) {
            if (!child.isMesh) continue;
            checkedCount++;
            
            // ВАЖНО: Пересчитываем BB каждый кадр, так как мы могли изменить матрицу
            // Но для статических объектов это дорого. Лучше делать это один раз при создании.
            // Для отладки сделаем принудительно:
            if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
                if (shouldLog && checkedCount < 5) console.log(`[DEBUG] Computed BB for mesh type: ${child.userData.type}`);
            }
            
            this._tempBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);

            if (this._playerBox.intersectsBox(this._tempBox)) {
                intersectedCount++;
                const colliderTopY = this._tempBox.max.y;
                
                // Проверяем, что это пол под нами, а не потолок над нами или стена сбоку
                // colliderTopY должен быть ниже наших ног (feetY + небольшой допуск)
                // и выше дна нашего поискового бокса
                if (colliderTopY <= feetY + 0.5 && colliderTopY > closestHitY) {
                    closestHitY = colliderTopY;
                    isLadderHit = child.userData.isLadder || false;
                    
                    if (shouldLog) {
                        console.log(`[DEBUG] HIT! Type: ${child.userData.type}, TopY: ${colliderTopY.toFixed(2)}, PlayerFeetY: ${feetY.toFixed(2)}`);
                    }
                }
            }
        }

        if (shouldLog) {
            console.log(`[DEBUG] Checked: ${checkedCount}, Intersected: ${intersectedCount}, ClosestHitY: ${closestHitY}`);
        }

        if (closestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadderHit;
            this.position.y = closestHitY + (this.playerHeight * 0.5);
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

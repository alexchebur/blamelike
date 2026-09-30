// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        
        // Состояние игрока
        this.position = new THREE.Vector3(0, 50, 0); 
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.onLadder = null; 
        
        // Параметры управления
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        // Векторы направления
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downRay = new THREE.Vector3(0, -1, 0);
        
        // Настройки
        this.playerHeight = config.playerHeight || 1.8;
        this.playerRadius = config.playerRadius || 0.4;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.jumpForce = config.jumpForce || 6;
        this.gravity = config.gravity || 18;
        this.ladderSpeed = config.ladderClimbSpeed || 4;
    }

    update(deltaTime, camera) {
        if (!camera) return;

        // Ограничиваем dt, чтобы не проваливаться сквозь пол при лагах
        const dt = Math.min(deltaTime, 0.05);

        // 1. Гравитация
        if (!this.onGround) {
            this.velocity.y -= this.gravity * dt;
        }

        // 2. Ввод движения
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        // 3. Расчет вектора движения относительно взгляда
        const moveSpeed = this.speed * dt;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0));

        const moveVec = new THREE.Vector3();
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z * moveSpeed);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x * moveSpeed);

        // 4. Логика лестниц
        let isClimbing = false;
        if (this.onLadder) {
            if (this.moveForward || this.moveBackward) {
                const climbDir = this.moveForward ? 1 : -1;
                this.velocity.y = climbDir * this.ladderSpeed;
                this.velocity.x = 0; 
                this.velocity.z = 0;
                isClimbing = true;
                this.onGround = true; 
            } else {
                this.velocity.y = 0;
                this.onGround = true;
            }
        }

        // 5. Прыжок
        if (this.jump && this.onGround && !isClimbing) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
            this.jump = false;
        }

        // 6. Предварительная позиция
        const nextPos = this.position.clone();
        if (!isClimbing) {
            nextPos.x += this.velocity.x + moveVec.x;
            nextPos.z += this.velocity.z + moveVec.z;
        }
        nextPos.y += this.velocity.y * dt;

        // 7. Коллизии
        this.checkFloorAndLadderCollisions(nextPos);

        // 8. Применение позиции к камере
        this.position.copy(nextPos);
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        
        // Обновление поворота камеры
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    checkFloorAndLadderCollisions(nextPos) {
        this.onGround = false;
        this.onLadder = null;

        const rayOrigin = nextPos.clone();
        rayOrigin.y += 0.2; 
        
        this.raycaster.set(rayOrigin, this.downRay);
        this.raycaster.far = this.playerHeight + 0.5; 

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // ВАЖНО: recursive: true, чтобы видеть коллайдеры внутри групп чанков
        const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            
            if (this.velocity.y <= 0 && hit.distance < this.playerHeight * 0.6) {
                if (hit.object.userData.isLadder) {
                    this.onLadder = hit.object;
                    nextPos.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                    this.onGround = true;
                } else {
                    nextPos.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                    this.onGround = true;
                }
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

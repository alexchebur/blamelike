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
        
        // Настройки Raycaster
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        // Параметры "толстого" обнаружения пола
        this.footRadius = 0.35; // Радиус расстановки лучей (квадрат 70x70см)
        this.maxFallDist = 2.5; // Максимальная глубина поиска пола
        
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.fallSpeed = config.fallSpeed || 12;
        this.climbSpeed = config.ladderClimbSpeed || 4;
        
        // Кэшированные векторы для лучей (чтобы не создавать мусор)
        this._rayOrigins = [
            new THREE.Vector3(), new THREE.Vector3(), 
            new THREE.Vector3(), new THREE.Vector3()
        ];
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

        // 2. Проверка пола (Multi-Ray)
        this.checkGroundRays(nextX, nextZ);

        // 3. Вертикальная логика
        let targetY = this.position.y;

        if (this.onGround) {
            if (this.onLadder && (this.moveForward || this.moveBackward)) {
                const climbDir = this.moveForward ? 1 : -1;
                targetY += climbDir * this.climbSpeed * dt;
            }
            // Если стоим на земле, Y уже скорректирован в checkGroundRays
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
     * Проверяет пол 4-мя лучами по углам квадрата под ногами.
     * Это игнорирует щели между платформами.
     */
    checkGroundRays(x, z) {
        this.onGround = false;
        this.onLadder = false;

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer || collisionLayer.children.length === 0) return;

        // Точка отсчета лучей: чуть выше текущих ног, чтобы не застревать
        const originY = this.position.y - (this.playerHeight * 0.5) + 0.2;
        
        // Настраиваем лучи
        this.raycaster.set(new THREE.Vector3(x, originY, z), this.downVector);
        this.raycaster.far = this.maxFallDist;

        let bestHitY = -Infinity;
        let isLadder = false;

        // Координаты 4-х углов квадрата под ногами
        const offsets = [
            [-this.footRadius, -this.footRadius],
            [this.footRadius, -this.footRadius],
            [-this.footRadius, this.footRadius],
            [this.footRadius, this.footRadius]
        ];

        for (let i = 0; i < 4; i++) {
            const ox = x + offsets[i][0];
            const oz = z + offsets[i][1];
            
            this.raycaster.ray.origin.set(ox, originY, oz);
            
            // recursive: true обязательно для обхода групп чанков
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Берем самую высокую точку пересечения (ближайшую к ногам)
                if (hit.point.y > bestHitY) {
                    bestHitY = hit.point.y;
                    isLadder = hit.object.userData.isLadder || false;
                }
            }
        }

        // Если нашли пол
        if (bestHitY > -Infinity) {
            this.onGround = true;
            this.isFalling = false;
            this.onLadder = isLadder;
            
            // Жестко ставим игрока на поверхность
            // Добавляем половину роста, так как position - это центр тела
            this.position.y = bestHitY + (this.playerHeight * 0.5);
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

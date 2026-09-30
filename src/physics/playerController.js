// src/physics/playerController.js
import * as THREE from 'three';

class PlayerController {
    constructor(sceneManager, config) {
        this.sceneManager = sceneManager;
        this.config = config;
        
        this.position = new THREE.Vector3(0, 10, 0); // Чуть выше нуля, чтобы упасть на первую платформу 
        this.velocity = new THREE.Vector3();
        this.onGround = false;
        this.onLadder = null; 
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.jump = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        this.raycaster = new THREE.Raycaster();
        this.downRay = new THREE.Vector3(0, -1, 0);
        
        this.playerHeight = config.playerHeight || 1.8;
        this.playerRadius = config.playerRadius || 0.4;
        this.speed = (config.moveSpeed || 50) / 1.5; 
        this.jumpForce = config.jumpForce || 6;
        this.gravity = config.gravity || 18;
        this.ladderSpeed = config.ladderClimbSpeed || 4;
        
        // Векторы для проверки стен (4 направления)
        this.wallCheckDirs = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1)
        ];
    }

    update(deltaTime, camera) {
        if (!camera) return;

        // === ЗАЩИТА ОТ БЕЗДНЫ ===
        // Если упали слишком низко, телепортируем обратно вверх
        if (this.position.y < -200) {
            console.warn('⚠️ Player fell into void! Resetting position.');
            this.position.y = 100;
            this.velocity.set(0, 0, 0);
            return;
        }

        // Ограничиваем deltaTime, чтобы при лагах не пробивать пол
        const dt = Math.min(deltaTime, 0.05); 

        // 1. Гравитация
        if (!this.onGround) {
            this.velocity.y -= this.gravity * dt;
        }

        // 2. Ввод движения
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const moveSpeed = this.speed * deltaTime;
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0));

        const moveVec = new THREE.Vector3();
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z * moveSpeed);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x * moveSpeed);

        // 3. Логика лестниц
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

        // 4. Прыжок
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
        camera.quaternion.setFromEuler(this.cameraEuler);
    }
    checkWallCollisions(nextPos, moveVec) {
        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // Проверяем движение в каждом направлении отдельно
        // Если есть препятствие на расстоянии радиуса игрока - блокируем ось
        
        // Упрощенный вариант: проверяем 4 точки вокруг игрока
        for (const dir of this.wallCheckDirs) {
            this.raycaster.set(
                new THREE.Vector3(nextPos.x, nextPos.y + this.playerHeight * 0.5, nextPos.z), 
                dir
            );
            
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, false);
            
            if (intersects.length > 0) {
                const dist = intersects[0].distance;
                // Если расстояние меньше радиуса + небольшой запас
                if (dist < this.playerRadius + 0.1) {
                    // Блокируем движение вдоль этой оси
                    if (Math.abs(dir.x) > 0.5) {
                        nextPos.x = this.position.x; // Откат по X
                        this.velocity.x = 0;
                    }
                    if (Math.abs(dir.z) > 0.5) {
                        nextPos.z = this.position.z; // Откат по Z
                        this.velocity.z = 0;
                    }
                }
            }
        }
    }

    checkFloorAndLadderCollisions(nextPos) {
        this.onGround = false;
        this.onLadder = null;

        // Пускаем луч чуть выше предполагаемых ног
        const rayOrigin = nextPos.clone();
        rayOrigin.y += 0.2; 
        
        this.raycaster.set(rayOrigin, this.downRay);
        // Увеличиваем дистанцию проверки, чтобы не проскакивать тонкие объекты
        this.raycaster.far = this.playerHeight + 0.5; 

        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer || collisionLayer.children.length === 0) return;

        // ВАЖНО: recursive = true, так как коллизии лежат во вложенных группах чанков
        const intersects = this.raycaster.intersectObjects(collisionLayer.children, true);

        if (intersects.length > 0) {
            // Берем ближайшее пересечение
            const hit = intersects[0];
            
            // Проверяем, что мы падаем вниз или стоим, а не летим вверх сквозь пол
            if (this.velocity.y <= 0 && hit.distance < this.playerHeight * 0.6) {
                
                if (hit.object.userData.isLadder) {
                    this.onLadder = hit.object;
                    // На лестнице фиксируем Y точно по точке удара + половина роста
                    nextPos.y = hit.point.y + this.playerHeight * 0.5;
                    this.velocity.y = 0;
                    this.onGround = true;
                } else {
                    // Обычный пол
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

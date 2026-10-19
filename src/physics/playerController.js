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

        // === АЛГОРИТМ SWEPT RAYCAST ===
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
        let isInsideLadderVolume = false; // Новый флаг: находимся ли мы внутри объема лестницы

        for (const offset of offsets) {
            const origin = new THREE.Vector3(nextX + offset.x, rayOriginY, nextZ + offset.z);
            this.raycaster.set(origin, this.downVector);
            this.raycaster.far = rayDistance;
            this.raycaster.near = 0;

            const intersects = this.raycaster.intersectObjects(collisionLayer.children, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Проверка типа через InstancedMesh
                let isLadderHit = false;
                if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
                    const types = hit.object.userData.primTypes;
                    if (types && types[hit.instanceId] && types[hit.instanceId].includes('stair')) {
                        isLadderHit = true;
                    }
                }

                if (isLadderHit) {
                    hitLadder = true;
                    // Если луч попал в лестницу, проверяем, где точка удара относительно ног
                    // Так как коллайдер лестницы теперь высокий (на весь ярус),
                    // то если мы вообще попали в него, значит мы внутри его объема по X/Z.
                    // Нам нужно проверить, находимся ли мы в пределах его высоты.
                    
                    // Поскольку мы используем Raycast вниз, если мы внутри высокого бокса,
                    // луч ударится в "пол" бокса (нижнюю грань) или пройдет сквозь, если мы ниже.
                    // Но для логики "зоны" нам достаточно факта попадания в объект типа stair.
                    
                    // Уточнение: если мы падаем СВЕРХУ на высокий бокс, луч ударится в верхнюю грань.
                    // В этом случае hit.point.y будет выше нас.
                    // Если мы внутри, hit.point.y будет ниже нас (или мы не hitting ничего, если near > 0).
                    
                    // Для простоты: если мы попали в лестницу, считаем что мы в зоне действия.
                    // Исключение: если точка удара значительно выше головы (мы под лестницей? нет, луч вниз).
                    // Если точка удара ниже ног - мы внутри.
                    if (hit.point.y <= feetY + 0.5) {
                         isInsideLadderVolume = true;
                    } else {
                        // Мы стоим НА верхней грани высокого бокса (упали сверху)
                        // В этом случае мы тоже считаем, что мы в зоне, но на самом верху
                        isInsideLadderVolume = true;
                    }
                }

                if (hit.point.y > hitFloorY) {
                    hitFloorY = hit.point.y;
                    hasHit = true;
                }
            }
        }

        // === ЛОГИКА ЛЕСТНИЦЫ (ПРИОРИТЕТ) ===
        // Если мы внутри объема лестницы (попали в высокий бокс)
        if (isInsideLadderVolume) {
            this.onLadder = true;
            this.onGround = false; // На лестнице мы не "на земле" в обычном смысле
            this.isFalling = false; // ГРАВИТАЦИЯ ОТКЛЮЧЕНА
            this.velocity.y = 0; // Останавливаем падение

            // Управление подъемом/спуском
            if (this.moveForward) {
                this.position.y += this.climbSpeed * dt;
            } else if (this.moveBackward) {
                this.position.y -= this.climbSpeed * dt;
            }
            
            // Ограничение, чтобы не вылететь за пределы яруса (опционально, но желательно)
            // Можно добавить проверку границ чанка здесь, но пока оставим свободный полет
            
            return; // Выходим из функции, обычная физика пола не применяется
        }

        // === ОБЫЧНАЯ ЛОГИКА ПОЛА (если мы не на лестнице) ===
        this.onLadder = false; // Сбрасываем флаг
        const floorLevel = hitFloorY + (this.playerHeight / 2);

        if (hasHit) {
            const isAboveOrAtFloor = this.position.y >= floorLevel - 0.05;

            if (isAboveOrAtFloor) {
                this.onGround = true;
                this.isFalling = false;
                this.velocity.y = 0;
                
                const targetY = floorLevel;
                this.position.y += (targetY - this.position.y) * 0.2;
                if (Math.abs(this.position.y - targetY) < 0.01) {
                    this.position.y = targetY;
                }
            } else {
                this.position.y += 0.5;
                this.onGround = false;
                this.isFalling = true;
            }
        } else {
            this.onGround = false;
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

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;

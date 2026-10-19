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
        this.playerRadius = 0.4;
        this.playerHeight = config.playerHeight || 1.8;
        this.speed = config.moveSpeed || 15.0; 
        this.maxFallSpeed = 20.0;
        this.gravity = 30.0;
        this.climbSpeed = config.ladderClimbSpeed || 6; // Оставлен для совместимости, но не используется для рамп
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

        // 2. Вертикальная физика
        this.updateVerticalPhysics(dt, nextX, nextZ);

        // Применяем горизонтальное смещение
        this.position.x = nextX;
        this.position.z = nextZ;

        // 3. Камера
        camera.position.set(this.position.x, this.position.y + this.playerHeight * 0.9, this.position.z);
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    updateVerticalPhysics(dt, nextX, nextZ) {
        const collisionLayer = this.sceneManager.collisionLayer;
        if (!collisionLayer) return;

        // === SWEPT RAYCAST ===
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
        let hasHit = false;
        let isLadderHit = false;
        let calculatedFloorY = -Infinity; // Для математической физики лестниц

        for (const offset of offsets) {
            const origin = new THREE.Vector3(nextX + offset.x, rayOriginY, nextZ + offset.z);
            this.raycaster.set(origin, this.downVector);
            this.raycaster.far = rayDistance;
            this.raycaster.near = 0;

            // recursive: false, т.к. дети collisionLayer - это уже InstancedMesh
            const intersects = this.raycaster.intersectObjects(collisionLayer.children, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // === ПРОВЕРКА ТИПА И МАТЕМАТИЧЕСКАЯ ФИЗИКА ЛЕСТНИЦ ===
                if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
                    const typeStr = hit.object.userData.primTypes[hit.instanceId];
                    
                    // Проверяем, является ли это рампой (лестницей-триггером)
                    if (typeStr && typeStr.startsWith('ramp_')) {
                        isLadderHit = true;
                        
                        // Парсим данные рампы: ramp_dir_startCoord_endCoord_startY_endY
                        const parts = typeStr.split('_');
                        const dir = parts[1]; // 'x' или 'z'
                        const startCoord = parseFloat(parts[2]);
                        const endCoord = parseFloat(parts[3]);
                        const startY = parseFloat(parts[4]);
                        const endY = parseFloat(parts[5]);
                        
                        // Текущая координата игрока в направлении рампы
                        const currentCoord = dir === 'x' ? nextX : nextZ;
                        
                        // Линейная интерполяция (clamp между 0 и 1)
                        let t = (currentCoord - startCoord) / (endCoord - startCoord);
                        t = Math.max(0, Math.min(1, t)); 
                        
                        // Вычисляем идеальную высоту пола математически
                        const mathFloorY = startY + (endY - startY) * t;
                        
                        // Используем математическую высоту вместо точки удара луча
                        if (mathFloorY > calculatedFloorY) {
                            calculatedFloorY = mathFloorY;
                            hitFloorY = mathFloorY; // Переопределяем для общей логики
                        }
                    } else if (typeStr && typeStr.includes('stair')) {
                        // Фолбэк для старых типов лестниц (если вдруг остались)
                        isLadderHit = true;
                    }
                }

                // Если это не рампа, используем стандартную точку удара
                if (calculatedFloorY === -Infinity && hit.point.y > hitFloorY) {
                    hitFloorY = hit.point.y;
                }
                
                hasHit = true;
            }
        }

        // === ОБРАБОТКА РЕЗУЛЬТАТОВ ===
        const floorLevel = hitFloorY + (this.playerHeight / 2);

        if (hasHit) {
            const isAboveOrAtFloor = this.position.y >= floorLevel - 0.05;

            if (isAboveOrAtFloor) {
                this.onGround = true;
                this.isFalling = false;
                this.velocity.y = 0;
                
                // Плавная коррекция позиции (LERP)
                const targetY = floorLevel;
                this.position.y += (targetY - this.position.y) * 0.2;
                if (Math.abs(this.position.y - targetY) < 0.01) {
                    this.position.y = targetY;
                }
            } else {
                // Мы ниже пола (застряли в геометрии). Мягко выталкиваем вверх.
                this.position.y += 0.5;
                this.onGround = false;
                this.isFalling = true;
            }
            
            this.onLadder = isLadderHit;
            
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

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;

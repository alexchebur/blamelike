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
        this.climbSpeed = config.ladderClimbSpeed || 6;
        this.ladderRailWidth = config.stairWidthRatio ? config.chunkSize / config.gridSize * config.stairWidthRatio : 3.0; // Ширина коридора лестницы
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
        let isOnRail = false;
        let railTargetY = -Infinity;

        for (const offset of offsets) {
            const origin = new THREE.Vector3(nextX + offset.x, rayOriginY, nextZ + offset.z);
            this.raycaster.set(origin, this.downVector);
            this.raycaster.far = rayDistance;
            this.raycaster.near = 0;

            const intersects = this.raycaster.intersectObjects(collisionLayer.children, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // === ПРОВЕРКА РЕЛЬСЫ ===
                if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
                    const typeStr = hit.object.userData.primTypes[hit.instanceId];
                    
                    if (typeStr && typeStr.startsWith('rail_')) {
                        const parts = typeStr.split('_');
                        // rail_sx_sz_ex_ey_sy_ey_width
                        const sx = parseFloat(parts[1]);
                        const sz = parseFloat(parts[2]);
                        const ex = parseFloat(parts[3]);
                        const ez = parseFloat(parts[4]);
                        const sy = parseFloat(parts[5]);
                        const ey = parseFloat(parts[6]);
                        const width = parseFloat(parts[7]);

                        // Вектор направления рельсы
                        const dx = ex - sx;
                        const dz = ez - sz;
                        const lenSq = dx*dx + dz*dz;

                        if (lenSq > 0.001) {
                            // Проекция игрока на линию рельсы
                            const t = ((nextX - sx) * dx + (nextZ - sz) * dz) / lenSq;
                            const clampedT = Math.max(0, Math.min(1, t));
                            
                            // Точка на линии, ближайшая к игроку
                            const projX = sx + clampedT * dx;
                            const projZ = sz + clampedT * dz;
                            
                            // Расстояние от игрока до линии (только X/Z)
                            const distToRail = Math.sqrt(Math.pow(nextX - projX, 2) + Math.pow(nextZ - projZ, 2));

                            // Если игрок в пределах ширины коридора
                            if (distToRail <= width / 2) {
                                isOnRail = true;
                                // Высота на рельсе
                                const targetY = sy + clampedT * (ey - sy);
                                if (targetY > railTargetY) {
                                    railTargetY = targetY;
                                }
                            }
                        }
                    }
                }

                // Стандартная проверка пола (если не на рельсе или рельса ниже обычного пола)
                if (!isOnRail && hit.point.y > hitFloorY) {
                    hitFloorY = hit.point.y;
                    hasHit = true;
                }
            }
        }

        // === ОБРАБОТКА РЕЗУЛЬТАТОВ ===
        
        // Приоритет рельсы над обычным полом
        if (isOnRail && railTargetY > -Infinity) {
            this.onLadder = true;
            this.onGround = false; // На рельсе мы не "на земле"
            this.isFalling = false;
            this.velocity.y = 0;
            
            // Плавное притяжение к высоте рельсы
            const targetY = railTargetY + (this.playerHeight / 2);
            this.position.y += (targetY - this.position.y) * 0.3; // Быстрое притяжение
            
            // Если очень близко, фиксируем точно
            if (Math.abs(this.position.y - targetY) < 0.02) {
                this.position.y = targetY;
            }
            
            // Управление движением вдоль рельсы через W/S
            // Мы не меняем Y напрямую, а позволяем игроку двигаться по X/Z,
            // а рельса сама подтянет его по Y. Но можно добавить ускорение:
            if (this.moveForward || this.moveBackward) {
                // Небольшой толчок в направлении движения, чтобы чувствовать контроль
                // (опционально, т.к. рельса и так держит высоту)
            }
            
        } else if (hasHit) {
            // Обычный пол
            this.onLadder = false;
            const floorLevel = hitFloorY + (this.playerHeight / 2);
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
            // Падение
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

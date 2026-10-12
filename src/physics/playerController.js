// src/physics/playerController.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

class PlayerController {
    constructor(sceneManager, config, physicsManager) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.physicsManager = physicsManager;
        
        // === ИНИЦИАЛИЗАЦИЯ ФИЗИЧЕСКОГО ТЕЛА ===
        const radius = config.playerRadius || 0.4;
        const height = config.playerHeight || 1.8;
        
        // Создаем форму цилиндра
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        
        // В Cannon-es цилиндр ориентирован по оси Z, поэтому поворачиваем его на 90 градусов вокруг X,
        // чтобы он стоял вертикально (по оси Y), как в Three.js
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        // Применяем поворот к форме (это важно для корректных коллизий)
        shape.transformAllPoints(new CANNON.Vec3(), q);

        this.body = new CANNON.Body({
            mass: 70, // Масса игрока
            fixedRotation: true, // Запрещаем вращение тела (чтобы не падать лицом вниз)
            material: physicsManager.defaultMaterial,
            position: new CANNON.Vec3(0, 50, 0)
        });
        
        this.body.addShape(shape);
        this.body.linearDamping = 0.9; // Сопротивление движению
        
        // Добавляем тело в физический мир
        physicsManager.world.addBody(this.body);

        // === СОБЫТИЕ СТОЛКНОВЕНИЯ ===
        // Вместо проверки contacts каждый кадр, слушаем события
        this.contactNormal = new CANNON.Vec3();
        this.upAxis = new CANNON.Vec3(0, 1, 0);
        this.onGround = false;
        
        // Флаг для отслеживания контакта с землей
        this.body.addEventListener('collide', (e) => {
            const contact = e.contact;
            
            // Получаем нормаль контакта. 
            // Если тело игрока - bi, то нормаль направлена от bi к bj.
            // Нам нужна нормаль, направленная ВВЕРХ от поверхности.
            if (contact.bi === this.body) {
                contact.ni.negate(this.contactNormal);
            } else {
                this.contactNormal.copy(contact.ni);
            }

            // Если нормаль смотрит вверх (угол с осью Y < 45 градусов), значит мы на земле
            if (this.contactNormal.dot(this.upAxis) > 0.5) {
                this.onGround = true;
            }
        });

        // Ссылка на позицию для рендера (синхронизируется в update)
        this.position = new THREE.Vector3(0, 50, 0); 
        
        // Управление
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        this.direction = new THREE.Vector3();
        this.cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        
        this.speed = config.moveSpeed || 10;
        this.climbSpeed = config.ladderClimbSpeed || 6;
    }

    update(deltaTime, camera) {
        if (!camera || !this.body) return;
        
        // Сбрасываем флаг земли каждый кадр (он будет установлен событием collide, если есть контакт)
        // Но событие collide срабатывает только при НОВОМ столкновении.
        // Для постоянного контакта нужно проверять контакты вручную или использовать sleep.
        // В Cannon-es лучше проверять world.contacts или использовать raycast вниз.
        // Для простоты и надежности используем Raycast вниз из центра тела.
        
        this.onGround = false;
        const rayFrom = this.body.position.clone();
        const rayTo = new CANNON.Vec3(rayFrom.x, rayFrom.y - (this.config.playerHeight / 2 + 0.2), rayFrom.z);
        const rayResult = new CANNON.RaycastResult();
        
        this.physicsManager.world.raycastClosest(rayFrom, rayTo, {}, rayResult);
        if (rayResult.hasHit) {
            // Проверяем нормаль поверхности
            if (rayResult.normal.dot(this.upAxis) > 0.5) {
                this.onGround = true;
            }
        }

        // Синхронизируем позицию Three.js с физическим телом
        this.position.copy(this.body.position);

        // 1. Горизонтальное движение
        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        
        const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
        const moveVec = new THREE.Vector3();
        
        if (this.direction.z !== 0) moveVec.addScaledVector(camDir, this.direction.z);
        if (this.direction.x !== 0) moveVec.addScaledVector(camRight, this.direction.x);
        
        // Применяем скорость к физическому телу
        if (moveVec.lengthSq() > 0) {
            this.body.velocity.x = moveVec.x * this.speed;
            this.body.velocity.z = moveVec.z * this.speed;
        } else {
            // Плавное торможение
            this.body.velocity.x *= 0.8;
            this.body.velocity.z *= 0.8;
        }

        // 2. Камера следует за игроком
        camera.position.set(
            this.position.x, 
            this.position.y + this.config.playerHeight * 0.9, 
            this.position.z
        );
        camera.quaternion.setFromEuler(this.cameraEuler);
    }

    onMouseMove(movementX, movementY) {
        const sensitivity = 0.002;
        this.cameraEuler.y -= movementX * sensitivity;
        this.cameraEuler.x -= movementY * sensitivity;
        this.cameraEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraEuler.x));
    }
}

export default PlayerController;

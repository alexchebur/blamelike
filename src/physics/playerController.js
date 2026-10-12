// src/physics/playerController.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

class PlayerController {
    constructor(sceneManager, config, physicsManager) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.physicsManager = physicsManager;
        
        // Создаем физическое тело игрока (цилиндр/капсула)
        const radius = config.playerRadius || 0.4;
        const height = config.playerHeight || 1.8;
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        
        // Поворачиваем цилиндр, так как в Cannon-es ось Y - это высота, а в Three.js тоже Y
        // Но Cylinder в Cannon ориентирован по Z, поэтому поворачиваем
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
        shape.transformAllPoints(new CANNON.Vec3(0,0,0), q);

        this.body = new CANNON.Body({
            mass: 70, // Масса игрока
            fixedRotation: true, // Запрещаем вращение тела (чтобы не падал лицом вниз)
            material: physicsManager.defaultMaterial,
            position: new CANNON.Vec3(0, 50, 0)
        });
        this.body.addShape(shape);
        this.body.linearDamping = 0.9; // Сопротивление движению (чтобы не скользил бесконечно)
        
        physicsManager.world.addBody(this.body);

        // Ссылка на позицию для рендера
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
        
        // Для проверки "на земле"
        this.contactNormal = new CANNON.Vec3();
        this.upAxis = new CANNON.Vec3(0, 1, 0);
        this.onGround = false;
        this.onLadder = false; // Пока заглушка, реализуется через триггеры
    }

    update(deltaTime, camera) {
        if (!camera) return;
        
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
        // Используем velocity напрямую для отзывчивого управления
        if (moveVec.lengthSq() > 0) {
            this.body.velocity.x = moveVec.x * this.speed;
            this.body.velocity.z = moveVec.z * this.speed;
        } else {
            // Если не двигаемся, гасим горизонтальную скорость (linearDamping сделает остальное)
            this.body.velocity.x *= 0.9;
            this.body.velocity.z *= 0.9;
        }

        // Проверка "на земле" через нормали контактов
        this.onGround = false;
        for (let i = 0; i < this.body.contacts.length; i++) {
            const contact = this.body.contacts[i];
            // Получаем нормаль контакта относительно игрока
            contact.ni.negate(this.contactNormal); 
            if (this.contactNormal.dot(this.upAxis) > 0.5) {
                this.onGround = true;
                break;
            }
        }

        // Логика лестниц (пока базовая, можно расширить через userData мешей)
        // if (this.onGround && this.onLadder && ...) { ... }

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

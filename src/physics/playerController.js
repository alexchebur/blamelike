// src/physics/playerController.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

class PlayerController {
    constructor(sceneManager, config, physicsManager) {
        this.sceneManager = sceneManager;
        this.config = config;
        this.physicsManager = physicsManager;
        
        // === PHYSICAL BODY INITIALIZATION ===
        const radius = config.playerRadius || 0.4;
        const height = config.playerHeight || 1.8;
        
        // Cylinder shape
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        
        // Rotate cylinder to stand vertically (Y-axis)
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        shape.transformAllPoints(new CANNON.Vec3(), q);

        this.body = new CANNON.Body({
            mass: 70,
            fixedRotation: true,
            material: physicsManager.defaultMaterial,
            position: new CANNON.Vec3(0, 50, 0)
        });
        
        this.body.addShape(shape);
        this.body.linearDamping = 0.9; // Air resistance
        physicsManager.world.addBody(this.body);

        // Ground check variables
        this.upAxis = new CANNON.Vec3(0, 1, 0);
        this.onGround = false;
        
        // Reference for rendering
        this.position = new THREE.Vector3(0, 50, 0); 
        
        // Controls
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
        
        // === SAFE GROUND CHECK VIA RAYCAST ===
        this.onGround = false;
        
        // Ray from center of body down to half height + margin
        const rayFrom = this.body.position.clone();
        const rayTo = new CANNON.Vec3(
            rayFrom.x, 
            rayFrom.y - (this.config.playerHeight / 2 + 0.2), 
            rayFrom.z
        );
        
        const rayResult = new CANNON.RaycastResult();
        // Check if raycast hits anything
        const hasHit = this.physicsManager.world.raycastClosest(rayFrom, rayTo, {}, rayResult);
        
        if (hasHit && rayResult.normal) {
            // If normal points up (angle with Y axis < ~60 degrees), we are on ground
            if (rayResult.normal.dot(this.upAxis) > 0.5) {
                this.onGround = true;
            }
        }
        // =================================================

        // Sync Three.js position with physical body
        this.position.copy(this.body.position);

        // 1. Horizontal Movement
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
        
        // Apply velocity to physical body
        if (moveVec.lengthSq() > 0) {
            this.body.velocity.x = moveVec.x * this.speed;
            this.body.velocity.z = moveVec.z * this.speed;
        } else {
            // Smooth braking
            this.body.velocity.x *= 0.8;
            this.body.velocity.z *= 0.8;
        }

        // 2. Camera follows player
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

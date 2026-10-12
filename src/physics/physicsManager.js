// src/physics/physicsManager.js
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

class PhysicsManager {
    constructor() {
        this.world = null;
        this.playerBody = null;
        this.chunkColliders = new Map(); // key: "cx,cy,cz", value: array of colliders
        this.isReady = false;
        this.initPromise = this.init();
    }

    async init() {
        await RAPIER.init();
        const gravity = { x: 0.0, y: -25.0, z: 0.0 };
        this.world = new RAPIER.World(gravity);
        this.isReady = true;
        console.log('✅ Rapier Physics initialized');
    }

    async waitForReady() {
        if (!this.isReady) await this.initPromise;
    }

    createPlayerBody(position) {
        if (!this.isReady) return null;
        
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setCcdEnabled(true) // Включаем Continuous Collision Detection (защита от проваливания)
            .setLinearDamping(0.9); // Сопротивление воздуха
            
        const body = this.world.createRigidBody(bodyDesc);
        
        // Капсула для игрока (радиус 0.4, высота 1.8)
        const colliderDesc = RAPIER.ColliderDesc.capsule(0.9, 0.4) // halfHeight, radius
            .setFriction(0.0)
            .setRestitution(0.0);
            
        this.world.createCollider(colliderDesc, body);
        this.playerBody = body;
        return body;
    }

    addChunkPrimitives(cx, cy, cz, primitives) {
        if (!this.isReady) return;
        
        const colliders = [];
        
        for (const prim of primitives) {
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                const sx = Math.max(0.01, Math.abs(Number(prim.scale?.x) || 1));
                const sy = Math.max(0.01, Math.abs(Number(prim.scale?.y) || 1));
                const sz = Math.max(0.01, Math.abs(Number(prim.scale?.z) || 1));
                const px = Number(prim.position?.x) || 0;
                const py = Number(prim.position?.y) || 0;
                const pz = Number(prim.position?.z) || 0;
                
                if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz)) continue;
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;

                // Создаем статичный куб
                const bodyDesc = RAPIER.RigidBodyDesc.fixed()
                    .setTranslation(px, py, pz);
                const body = this.world.createRigidBody(bodyDesc);
                
                const hx = sx / 2, hy = sy / 2, hz = sz / 2;
                const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
                    .setFriction(0.0);
                    
                // Применяем вращение
                const euler = new THREE.Euler(
                    THREE.MathUtils.degToRad(prim.rotation?.tiltX || 0),
                    THREE.MathUtils.degToRad(prim.rotation?.tiltY || 0),
                    THREE.MathUtils.degToRad(prim.rotation?.twistZ || 0)
                );
                const quat = new THREE.Quaternion().setFromEuler(euler);
                colliderDesc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
                
                const collider = this.world.createCollider(colliderDesc, body);
                colliders.push({ body, collider });
            } catch (e) {
                // Rapier гораздо стабильнее, но на всякий случай
                console.warn(`⚠️ Rapier skip prim ${prim.type}:`, e.message);
            }
        }
        
        this.chunkColliders.set(`${cx},${cy},${cz}`, colliders);
    }

    removeChunk(cx, cy, cz) {
        const key = `${cx},${cy},${cz}`;
        const colliders = this.chunkColliders.get(key);
        if (colliders && this.isReady) {
            colliders.forEach(({ body }) => {
                this.world.removeRigidBody(body);
            });
            this.chunkColliders.delete(key);
        }
    }

    step() {
        if (this.isReady && this.world) {
            this.world.step();
        }
    }

    clear() {
        if (!this.isReady) return;
        for (const [, colliders] of this.chunkColliders) {
            colliders.forEach(({ body }) => this.world.removeRigidBody(body));
        }
        this.chunkColliders.clear();
        if (this.playerBody) {
            this.world.removeRigidBody(this.playerBody);
            this.playerBody = null;
        }
    }
    
    getPlayerPosition() {
        if (this.playerBody) {
            const t = this.playerBody.translation();
            return new THREE.Vector3(t.x, t.y, t.z);
        }
        return new THREE.Vector3(0, 50, 0);
    }
    
    setPlayerVelocity(x, z) {
        if (this.playerBody) {
            const vel = this.playerBody.linvel();
            this.playerBody.setLinvel({ x: x, y: vel.y, z: z }, true);
        }
    }
    
    isPlayerOnGround() {
        if (!this.playerBody || !this.isReady) return false;
        // Простая проверка: если вертикальная скорость близка к 0 и тело не движется вниз быстро
        const vel = this.playerBody.linvel();
        return Math.abs(vel.y) < 0.5;
    }
}

export default PhysicsManager;

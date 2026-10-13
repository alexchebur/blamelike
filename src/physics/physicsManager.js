// src/physics/physicsManager.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

class PhysicsManager {
    constructor() {
        this.world = new CANNON.World();
        // Усиленная гравитация для более четкого ощущения пола
        this.world.gravity.set(0, -25, 0); 
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true; // Экономия ресурсов
        
        this.defaultMaterial = new CANNON.Material('default');
        const contactMat = new CANNON.ContactMaterial(this.defaultMaterial, this.defaultMaterial, {
            friction: 0.0, restitution: 0.0
        });
        this.world.addContactMaterial(contactMat);
        
        this.chunkBodies = new Map();
        this.playerBody = null;
    }

    createPlayerBody(position) {
        const radius = 0.4;
        const height = 1.8;
        
        // Цилиндр, повернутый вертикально
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2);
        shape.transformAllPoints(new CANNON.Vec3(), q);

        this.playerBody = new CANNON.Body({
            mass: 70,
            fixedRotation: true,
            material: this.defaultMaterial,
            position: new CANNON.Vec3(position.x, position.y, position.z)
        });
        
        // === КЛЮЧЕВОЕ: CCD защищает от проваливания сквозь тонкие мосты ===
        this.playerBody.ccdSpeedThreshold = 0.1; 
        this.playerBody.ccdSweptSphereRadius = 0.4; 
        
        this.playerBody.addShape(shape);
        this.playerBody.linearDamping = 0.9;
        this.world.addBody(this.playerBody);
        return this.playerBody;
    }

    addChunkPrimitives(cx, cy, cz, primitives) {
        const bodies = [];
        
        for (const prim of primitives) {
            // Фильтр проходимых объектов
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // === БРОНИРОВАННАЯ ВАЛИДАЦИЯ ===
                const sx = Math.max(0.05, Math.abs(Number(prim.scale?.x) || 1));
                const sy = Math.max(0.05, Math.abs(Number(prim.scale?.y) || 1));
                const sz = Math.max(0.05, Math.abs(Number(prim.scale?.z) || 1));
                
                const px = Number(prim.position?.x);
                const py = Number(prim.position?.y);
                const pz = Number(prim.position?.z);

                // Пропускаем объекты с NaN координатами
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;

                // Создаем ТОЛЬКО Box. Это самый стабильный шейп для процедурных миров
                const shape = new CANNON.Box(new CANNON.Vec3(sx/2, sy/2, sz/2));
                
                const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
                body.position.set(px, py, pz);
                
                const q = new CANNON.Quaternion();
                q.setFromEuler(
                    THREE.MathUtils.degToRad(Number(prim.rotation?.tiltX) || 0),
                    THREE.MathUtils.degToRad(Number(prim.rotation?.tiltY) || 0),
                    THREE.MathUtils.degToRad(Number(prim.rotation?.twistZ) || 0)
                );
                body.quaternion.copy(q);
                body.addShape(shape);
                
                this.world.addBody(body);
                bodies.push(body);
            } catch (e) {
                // Тихо пропускаем проблемные примитивы, чтобы не ломать генерацию
                // console.warn(`⚠️ Skip prim ${prim.type}:`, e.message);
            }
        }
        
        this.chunkBodies.set(`${cx},${cy},${cz}`, bodies);
        console.log(`✅ Physics chunk ${cx},${cy},${cz}: created ${bodies.length} bodies`);
    }

    removeChunk(cx, cy, cz) {
        const key = `${cx},${cy},${cz}`;
        const bodies = this.chunkBodies.get(key);
        if (bodies) {
            bodies.forEach(b => this.world.removeBody(b));
            this.chunkBodies.delete(key);
        }
    }

    step(dt) {
        // Фиксированный шаг + ограничение delta для стабильности
        this.world.step(1/60, Math.min(dt, 0.1), 3);
    }

    clear() {
        for (const [, bodies] of this.chunkBodies) {
            bodies.forEach(b => this.world.removeBody(b));
        }
        this.chunkBodies.clear();
        if (this.playerBody) {
            this.world.removeBody(this.playerBody);
            this.playerBody = null;
        }
    }
}
export default PhysicsManager;

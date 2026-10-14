// src/physics/physicsManager.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

class PhysicsManager {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -25, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true;
        
        this.defaultMaterial = new CANNON.Material('default');
        const contactMat = new CANNON.ContactMaterial(this.defaultMaterial, this.defaultMaterial, {
            friction: 0.0, restitution: 0.0
        });
        this.world.addContactMaterial(contactMat);
        
        this.chunkBodies = new Map();
        this.playerBody = null;
    }

    createPlayerBody(position) {
        // Используем Box для игрока для максимальной совместимости
        const shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.9, 0.4)); 
        
        this.playerBody = new CANNON.Body({
            mass: 70,
            fixedRotation: true,
            material: this.defaultMaterial,
            position: new CANNON.Vec3(
                isFinite(position.x) ? position.x : 0,
                isFinite(position.y) ? position.y : 50,
                isFinite(position.z) ? position.z : 0
            )
        });
        
        this.playerBody.ccdSpeedThreshold = 0.1; 
        this.playerBody.ccdSweptSphereRadius = 0.4; 
        
        this.playerBody.addShape(shape);
        this.playerBody.linearDamping = 0.9;
        this.world.addBody(this.playerBody);
        return this.playerBody;
    }

    addChunkPrimitives(cx, cy, cz, primitives) {
        const bodies = [];
        let errorCount = 0;
        
        for (const prim of primitives) {
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // 1. Санитизация масштаба
                let sx = Math.abs(Number(prim.scale?.x) || 1);
                let sy = Math.abs(Number(prim.scale?.y) || 1);
                let sz = Math.abs(Number(prim.scale?.z) || 1);
                
                const minSize = 0.05;
                if (sx < minSize) sx = minSize;
                if (sy < minSize) sy = minSize;
                if (sz < minSize) sz = minSize;

                const hx = sx / 2, hy = sy / 2, hz = sz / 2;

                // 2. Создаем форму через Trimesh (обход бага Box)
                const vertices = [
                    -hx,-hy,-hz, hx,-hy,-hz, hx, hy,-hz, -hx, hy,-hz,
                    -hx,-hy, hz, hx,-hy, hz, hx, hy, hz, -hx, hy, hz
                ];
                const indices = [
                    0,1,2, 0,2,3, 4,6,5, 4,7,6,
                    0,4,5, 0,5,1, 2,6,7, 2,7,3,
                    0,3,7, 0,7,4, 1,5,6, 1,6,2
                ];
                const shape = new CANNON.Trimesh(vertices, indices);

                // 3. Санитизация позиции (ЯВНОЕ СОЗДАНИЕ ВЕКТОРА)
                const px = Number(prim.position?.x);
                const py = Number(prim.position?.y);
                const pz = Number(prim.position?.z);
                
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;
                
                const posVec = new CANNON.Vec3(px, py, pz);

                // 4. Санитизация вращения
                const rx = THREE.MathUtils.degToRad(Number(prim.rotation?.tiltX) || 0);
                const ry = THREE.MathUtils.degToRad(Number(prim.rotation?.tiltY) || 0);
                const rz = THREE.MathUtils.degToRad(Number(prim.rotation?.twistZ) || 0);
                
                const q = new CANNON.Quaternion();
                q.setFromEuler(rx, ry, rz);
                // Нормализация кватерниона критически важна!
                q.normalize();

                // 5. Создание тела и ДОБАВЛЕНИЕ В МИР
                const body = new CANNON.Body({ 
                    mass: 0, 
                    material: this.defaultMaterial,
                    position: posVec,
                    quaternion: q
                });
                
                body.addShape(shape);
                
                // ОБЕРТЫВАЕМ addBody В ОТДЕЛЬНЫЙ TRY-CATCH
                this.world.addBody(body);
                bodies.push(body);
                
            } catch (e) {
                if (errorCount < 3) {
                    console.warn(`⚠️ Physics skip prim ${prim.type}:`, e.message);
                }
                errorCount++;
            }
        }
        
        this.chunkBodies.set(`${cx},${cy},${cz}`, bodies);
    }

    removeChunk(cx, cy, cz) {
        const key = `${cx},${cy},${cz}`;
        const bodies = this.chunkBodies.get(key);
        if (bodies) {
            try {
                bodies.forEach(b => this.world.removeBody(b));
            } catch (e) {
                console.warn(`⚠️ Error removing chunk ${key}:`, e.message);
            }
            this.chunkBodies.delete(key);
        }
    }

    step(dt) {
        if (!dt || !isFinite(dt) || dt <= 0) dt = 1/60;
        const safeDt = Math.min(dt, 0.1);
        try {
            this.world.step(1/60, safeDt, 3);
        } catch (e) {
            console.error("❌ Physics step error:", e.message);
        }
    }

    clear() {
        for (const [, bodies] of this.chunkBodies) {
            try {
                bodies.forEach(b => this.world.removeBody(b));
            } catch (e) {}
        }
        this.chunkBodies.clear();
        if (this.playerBody) {
            try { this.world.removeBody(this.playerBody); } catch(e) {}
            this.playerBody = null;
        }
    }
}
export default PhysicsManager;

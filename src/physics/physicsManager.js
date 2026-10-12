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
        this.totalBodies = 0;
    }

    addChunkPrimitives(cx, cy, cz, primitives, config) {
        const bodies = [];
        let count = 0;
        let errorCount = 0;

        for (const prim of primitives) {
            // Фильтруем только проходимые объекты
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // === ЗАЩИТА ОТ НЕВАЛИДНЫХ ДАННЫХ ===
                const sx = Math.abs(prim.scale?.x || 1);
                const sy = Math.abs(prim.scale?.y || 1);
                const sz = Math.abs(prim.scale?.z || 1);
                
                // Пропускаем объекты с нулевыми или слишком маленькими размерами
                if (sx < 0.01 || sy < 0.01 || sz < 0.01) {
                    continue;
                }

                const px = prim.position?.x ?? 0;
                const py = prim.position?.y ?? 0;
                const pz = prim.position?.z ?? 0;

                // Пропускаем объекты с NaN координатами
                if (isNaN(px) || isNaN(py) || isNaN(pz)) {
                    if (errorCount < 5) console.warn(`⚠️ NaN position in prim ${prim.type}`);
                    errorCount++;
                    continue;
                }

                // Создаем Box shape для всех проходимых примитивов
                const shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));

                const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
                body.position.set(px, py, pz);
                
                const q = new CANNON.Quaternion();
                q.setFromEuler(
                    THREE.MathUtils.degToRad(prim.rotation?.tiltX || 0),
                    THREE.MathUtils.degToRad(prim.rotation?.tiltY || 0),
                    THREE.MathUtils.degToRad(prim.rotation?.twistZ || 0)
                );
                body.quaternion.copy(q);
                body.addShape(shape);
                
                this.world.addBody(body);
                bodies.push(body);
                count++;
            } catch (e) {
                if (errorCount < 5) {
                    console.error(`❌ Physics error for prim ${prim.type}:`, e.message);
                    console.log('Prim data:', prim);
                }
                errorCount++;
            }
        }
        
        this.chunkBodies.set(`${cx},${cy},${cz}`, bodies);
        this.totalBodies += count;
        
        if (errorCount > 0) {
            console.warn(`⚠️ Chunk ${cx},${cy},${cz}: ${errorCount} physics errors skipped.`);
        }
    }

    removeChunk(cx, cy, cz) {
        const key = `${cx},${cy},${cz}`;
        const bodies = this.chunkBodies.get(key);
        if (bodies) {
            bodies.forEach(b => this.world.removeBody(b));
            this.totalBodies -= bodies.length;
            this.chunkBodies.delete(key);
        }
    }

    step(dt) {
        this.world.step(1/60, dt, 3);
    }

    clear() {
        for (const [, bodies] of this.chunkBodies) {
            bodies.forEach(b => this.world.removeBody(b));
        }
        this.chunkBodies.clear();
        this.totalBodies = 0;
    }
}
export default PhysicsManager;

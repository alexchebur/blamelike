// src/physics/physicsManager.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

class PhysicsManager {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -25, 0);
        
        // === ИСПРАВЛЕНИЕ 1: Используем NaiveBroadphase вместо SAP ===
        // SAPBroadphase может вызывать ошибки "Invalid array length" при массовой загрузке статики
        this.world.broadphase = new CANNON.NaiveBroadphase();
        
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
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // === ЖЕСТКАЯ ВАЛИДАЦИЯ ===
                const sx = Number(prim.scale?.x);
                const sy = Number(prim.scale?.y);
                const sz = Number(prim.scale?.z);
                
                // Пропускаем NaN, Infinity и слишком маленькие объекты
                if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz)) continue;
                if (sx < 0.05 || sy < 0.05 || sz < 0.05) continue; // Увеличили порог до 0.05

                const px = Number(prim.position?.x);
                const py = Number(prim.position?.y);
                const pz = Number(prim.position?.z);
                
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;

                const rx = Number(prim.rotation?.tiltX) || 0;
                const ry = Number(prim.rotation?.tiltY) || 0;
                const rz = Number(prim.rotation?.twistZ) || 0;
                
                if (!isFinite(rx) || !isFinite(ry) || !isFinite(rz)) continue;

                // Создаем форму
                const halfExtents = new CANNON.Vec3(sx / 2, sy / 2, sz / 2);
                const shape = new CANNON.Box(halfExtents);

                // === ИСПРАВЛЕНИЕ 2: Явное создание тела с позицией ===
                const body = new CANNON.Body({ 
                    mass: 0, 
                    material: this.defaultMaterial,
                    position: new CANNON.Vec3(px, py, pz),
                    quaternion: new CANNON.Quaternion().setFromEuler(
                        THREE.MathUtils.degToRad(rx),
                        THREE.MathUtils.degToRad(ry),
                        THREE.MathUtils.degToRad(rz)
                    )
                });
                
                body.addShape(shape);
                
                // === ИСПРАВЛЕНИЕ 3: Принудительное обновление свойств массы ===
                // Это предотвращает внутренние ошибки массивов в Cannon при добавлении статики
                body.updateMassProperties();
                
                this.world.addBody(body);
                bodies.push(body);
                count++;
            } catch (e) {
                if (errorCount < 3) {
                    console.error(`❌ Physics error for prim ${prim.type}:`, e.message);
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
        const safeDt = Math.min(dt, 0.1);
        this.world.step(1/60, safeDt, 3);
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

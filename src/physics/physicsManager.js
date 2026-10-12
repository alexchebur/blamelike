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
                // === АБСОЛЮТНАЯ ЗАЩИТА ДАННЫХ ДЛЯ CANNON-ES ===
                
                // 1. Безопасное извлечение и приведение к числу
                const rawSx = Number(prim.scale?.x);
                const rawSy = Number(prim.scale?.y);
                const rawSz = Number(prim.scale?.z);
                const rawPx = Number(prim.position?.x);
                const rawPy = Number(prim.position?.y);
                const rawPz = Number(prim.position?.z);
                const rawRx = Number(prim.rotation?.tiltX) || 0;
                const rawRy = Number(prim.rotation?.tiltY) || 0;
                const rawRz = Number(prim.rotation?.twistZ) || 0;

                // 2. Жесткая фильтрация невалидных значений
                // isFinite отсекает NaN и Infinity
                // Math.max(0.01, ...) гарантирует строго положительное значение и минимальный размер
                if (!isFinite(rawSx) || !isFinite(rawSy) || !isFinite(rawSz)) continue;
                if (!isFinite(rawPx) || !isFinite(rawPy) || !isFinite(rawPz)) continue;
                if (!isFinite(rawRx) || !isFinite(rawRy) || !isFinite(rawRz)) continue;

                const sx = Math.max(0.01, Math.abs(rawSx));
                const sy = Math.max(0.01, Math.abs(rawSy));
                const sz = Math.max(0.01, Math.abs(rawSz));

                // 3. Создание формы с гарантированно валидными halfExtents
                const halfExtents = new CANNON.Vec3(sx / 2, sy / 2, sz / 2);
                const shape = new CANNON.Box(halfExtents);

                // 4. Создание тела с гарантированно валидной позицией
                const body = new CANNON.Body({ 
                    mass: 0, 
                    material: this.defaultMaterial
                });
                body.position.set(rawPx, rawPy, rawPz);
                
                // 5. Безопасная установка вращения
                const q = new CANNON.Quaternion();
                q.setFromEuler(
                    THREE.MathUtils.degToRad(rawRx),
                    THREE.MathUtils.degToRad(rawRy),
                    THREE.MathUtils.degToRad(rawRz)
                );
                body.quaternion.copy(q);
                
                body.addShape(shape);
                this.world.addBody(body);
                bodies.push(body);
                count++;
            } catch (e) {
                if (errorCount < 3) {
                    console.error(`❌ Physics error for prim ${prim.type}:`, e.message);
                    console.log('Problematic prim:', JSON.stringify(prim, null, 2));
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

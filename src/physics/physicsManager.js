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
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // Валидация данных
                const sx = Math.max(0.01, Math.abs(Number(prim.scale?.x) || 1));
                const sy = Math.max(0.01, Math.abs(Number(prim.scale?.y) || 1));
                const sz = Math.max(0.01, Math.abs(Number(prim.scale?.z) || 1));
                const px = Number(prim.position?.x) || 0;
                const py = Number(prim.position?.y) || 0;
                const pz = Number(prim.position?.z) || 0;
                
                if (!isFinite(sx) || !isFinite(sy) || !isFinite(sz)) continue;
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;

                const hx = sx / 2, hy = sy / 2, hz = sz / 2;
                let shape;

                try {
                    // Пытаемся создать стандартный Box
                    shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
                } catch (boxError) {
                    // === FALLBACK: Создаем Box через Trimesh (обход бага конструктора) ===
                    // Вершины куба
                    const vertices = [
                        -hx, -hy, -hz,   hx, -hy, -hz,   hx,  hy, -hz,  -hx,  hy, -hz,
                        -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz
                    ];
                    // Индексы треугольников (12 треугольников для 6 граней)
                    const indices = [
                        0, 1, 2,  0, 2, 3, // front
                        4, 6, 5,  4, 7, 6, // back
                        0, 4, 5,  0, 5, 1, // bottom
                        2, 6, 7,  2, 7, 3, // top
                        0, 3, 7,  0, 7, 4, // left
                        1, 5, 6,  1, 6, 2  // right
                    ];
                    shape = new CANNON.Trimesh(vertices, indices);
                }

                const body = new CANNON.Body({ 
                    mass: 0, 
                    material: this.defaultMaterial
                });
                body.position.set(px, py, pz);
                
                const rx = Number(prim.rotation?.tiltX) || 0;
                const ry = Number(prim.rotation?.tiltY) || 0;
                const rz = Number(prim.rotation?.twistZ) || 0;
                
                const q = new CANNON.Quaternion();
                q.setFromEuler(
                    THREE.MathUtils.degToRad(rx),
                    THREE.MathUtils.degToRad(ry),
                    THREE.MathUtils.degToRad(rz)
                );
                body.quaternion.copy(q);
                
                body.addShape(shape);
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
        
        if (errorCount > 0 && errorCount < 10) {
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

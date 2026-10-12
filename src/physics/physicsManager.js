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
    }

    addChunkPrimitives(cx, cy, cz, primitives, config) {
        const bodies = [];
        for (const prim of primitives) {
            // Фильтруем только проходимые объекты
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                const shape = new CANNON.Box(new CANNON.Vec3(
                    Math.abs(prim.scale.x) / 2,
                    Math.abs(prim.scale.y) / 2,
                    Math.abs(prim.scale.z) / 2
                ));

                const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
                body.position.set(prim.position.x, prim.position.y, prim.position.z);
                
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
            } catch (e) {
                console.warn(`⚠️ Physics error for prim ${prim.type}:`, e);
            }
        }
        this.chunkBodies.set(`${cx},${cy},${cz}`, bodies);
        console.log(`✅ Physics chunk ${cx},${cy},${cz} loaded: ${bodies.length} bodies`);
    }

    removeChunk(cx, cy, cz) {
        const key = `${cx},${cy},${cz}`;
        const bodies = this.chunkBodies.get(key);
        if (bodies) {
            bodies.forEach(b => this.world.removeBody(b));
            this.chunkBodies.delete(key);
            console.log(`️ Physics chunk ${key} removed`);
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
    }
}
export default PhysicsManager;

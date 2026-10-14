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
        // Используем Box вместо Cylinder для игрока, так как Cylinder часто вызывает проблемы в ESM-сборках
        const shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.9, 0.4)); 
        
        this.playerBody = new CANNON.Body({
            mass: 70,
            fixedRotation: true,
            material: this.defaultMaterial,
            position: new CANNON.Vec3(position.x, position.y, position.z)
        });
        
        // CCD критически важен для предотвращения проваливания
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
            // 1. Быстрая фильтрация непроходимых объектов
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen' || prim.type === 'torus') continue;
            if (prim.type.includes('cable')) continue;
            
            const isWalkable = prim.type === 'box' || prim.type.includes('stair') || 
                               prim.type.includes('bridge') || prim.type === 'platform_stair';
            if (!isWalkable) continue;

            try {
                // 2. Санитизация масштаба ДО создания формы
                let sx = Number(prim.scale?.x);
                let sy = Number(prim.scale?.y);
                let sz = Number(prim.scale?.z);

                if (!isFinite(sx)) sx = 1;
                if (!isFinite(sy)) sy = 1;
                if (!isFinite(sz)) sz = 1;

                sx = Math.abs(sx);
                sy = Math.abs(sy);
                sz = Math.abs(sz);
                
                const minSize = 0.05;
                if (sx < minSize) sx = minSize;
                if (sy < minSize) sy = minSize;
                if (sz < minSize) sz = minSize;

                const hx = sx / 2;
                const hy = sy / 2;
                const hz = sz / 2;

                // 3. Создаем ТОЛЬКО через Trimesh (обход бага CANNON.Box в ESM)
                // Вершины куба (8 точек)
                const vertices = [
                    -hx,-hy,-hz,  hx,-hy,-hz,  hx, hy,-hz, -hx, hy,-hz,
                    -hx,-hy, hz,  hx,-hy, hz,  hx, hy, hz, -hx, hy, hz
                ];
                // Индексы треугольников (12 треугольников для 6 граней)
                const indices = [
                    0,1,2, 0,2,3, // front
                    4,6,5, 4,7,6, // back
                    0,4,5, 0,5,1, // bottom
                    2,6,7, 2,7,3, // top
                    0,3,7, 0,7,4, // left
                    1,5,6, 1,6,2  // right
                ];
                
                const shape = new CANNON.Trimesh(vertices, indices);

                // 4. Санитизация позиции ДО создания тела
                const px = Number(prim.position?.x);
                const py = Number(prim.position?.y);
                const pz = Number(prim.position?.z);
                
                if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) continue;

                // 5. Создание тела и установка параметров
                const body = new CANNON.Body({ mass: 0, material: this.defaultMaterial });
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
                
            } catch (e) {
                // Тихо пропускаем проблемные примитивы, но логируем первые 3 ошибки для отладки
                if (bodies.length < 3) {
                    console.warn(`⚠️ Physics skip prim ${prim.type}:`, e.message);
                }
            }
        }
        
        this.chunkBodies.set(`${cx},${cy},${cz}`, bodies);
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
        if (!dt || !isFinite(dt) || dt <= 0) dt = 1/60;
        const safeDt = Math.min(dt, 0.1);
        this.world.step(1/60, safeDt, 3);
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

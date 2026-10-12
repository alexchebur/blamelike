// src/physics/physicsManager.js
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

class PhysicsManager {
    constructor() {
        // Создаем физический мир
        this.world = new CANNON.World();
        this.world.gravity.set(0, -25, 0); // Гравитация чуть сильнее земной для отзывчивости
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Быстрый алгоритм поиска пар
        this.world.allowSleep = true; // Отключаем расчеты для спящих тел
        
        // Материалы для трения и упругости
        this.defaultMaterial = new CANNON.Material('default');
        const defaultContactMaterial = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.defaultMaterial,
            { friction: 0.0, restitution: 0.0 } // Нулевое трение и отскок для точного контроля
        );
        this.world.addContactMaterial(defaultContactMaterial);
        
        // Кэш физических тел чанков для быстрого удаления
        this.chunkBodies = new Map();
    }

    /**
     * Создает статичное тело для чанка на основе примитивов
     */
    addChunkPrimitives(cx, cy, cz, primitives, config) {
        const bodies = [];
        
        for (const prim of primitives) {
            // Фильтруем только проходимые объекты (та же логика, что и в heightMap)
            if (prim.role === 'decor' || prim.role === 'micro') continue;
            if (prim.type === 'screen') continue;
            if (prim.type === 'cable' || prim.type === 'l_cable') continue; 
            if (prim.type === 'torus') continue;
            
            const isWalkable = 
                prim.type === 'box' || 
                prim.type.includes('stair') || 
                prim.type.includes('bridge') ||
                prim.type === 'platform_stair';
                
            if (!isWalkable) continue;

            let shape = null;
            
            // Для всех объектов используем BoxShape, так как он самый быстрый и стабильный
            // Cannon-es сам обработает повороты и масштаб
            const halfExtents = new CANNON.Vec3(
                Math.abs(prim.scale.x) / 2,
                Math.abs(prim.scale.y) / 2,
                Math.abs(prim.scale.z) / 2
            );
            shape = new CANNON.Box(halfExtents);

            if (shape) {
                const body = new CANNON.Body({
                    mass: 0, // 0 = статичное тело
                    material: this.defaultMaterial,
                    position: new CANNON.Vec3(prim.position.x, prim.position.y, prim.position.z)
                });
                
                // Применяем поворот
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
            }
        }
        
        const chunkKey = `${cx},${cy},${cz}`;
        this.chunkBodies.set(chunkKey, bodies);
    }

    /**
     * Удаляет физические тела чанка при выгрузке
     */
    removeChunk(cx, cy, cz) {
        const chunkKey = `${cx},${cy},${cz}`;
        const bodies = this.chunkBodies.get(chunkKey);
        if (bodies) {
            for (const body of bodies) {
                this.world.removeBody(body);
            }
            this.chunkBodies.delete(chunkKey);
        }
    }

    /**
     * Обновляет физический мир
     */
    step(dt) {
        // Фиксированный шаг времени для стабильности физики
        this.world.step(1/60, dt, 3);
    }

    /**
     * Очищает весь физический мир
     */
    clear() {
        for (const [, bodies] of this.chunkBodies) {
            for (const body of bodies) {
                this.world.removeBody(body);
            }
        }
        this.chunkBodies.clear();
    }
}

export default PhysicsManager;

// src/render/screenManager.js
// @ts-check
import * as THREE from 'three';

class ScreenManager {
    constructor(scene) {
        this.scene = scene;
        this.activeScreens = new Map();
        this.textureCache = new Map();
        
        this.screenTypes = {
            monitor: { width: 64, height: 32, color: 0x00ff88, interval: 200 },
            panel: { width: 32, height: 16, color: 0x00aaff, interval: 300 },
            display: { width: 48, height: 24, color: 0xff6600, interval: 150 }
        };
        
        this.frameCount = 0;
        this.lastUpdateTime = 0;
        
        // Временные вектора для расчетов, чтобы не создавать мусор
        this._tempVec = new THREE.Vector3();
        this._tempDir = new THREE.Vector3();
    }

    createScreenTexture(type = 'monitor') {
        const config = this.screenTypes[type] || this.screenTypes.monitor;
        const cacheKey = `${type}_${config.width}x${config.height}`;
        
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = config.width;
        canvas.height = config.height;
        const ctx = canvas.getContext('2d', { alpha: false }); // Отключаем альфа-канал для скорости
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        const result = { canvas, texture, config, ctx };
        this.textureCache.set(cacheKey, result);
        
        return result;
    }

    addScreen(key, position, rotation, scale, type = 'monitor') {
        if (this.activeScreens.has(key)) {
            this.updateScreenPosition(key, position, rotation, scale);
            return;
        }
        
        const screenData = this.createScreenTexture(type);
        const config = this.screenTypes[type];
        
        const material = new THREE.MeshBasicMaterial({
            map: screenData.texture,
            color: config.color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(
            THREE.MathUtils.degToRad(rotation.tiltX || 0),
            THREE.MathUtils.degToRad(rotation.tiltY || 0),
            THREE.MathUtils.degToRad(rotation.twistZ || 0)
        );
        mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        
        // ВАЖНО: Включаем фрустум куллинг для самих мешей экранов
        mesh.frustumCulled = true; 
        
        this.scene.add(mesh);
        
        this.activeScreens.set(key, {
            mesh,
            material,
            screenData,
            type,
            lastUpdate: 0 // Индивидуальный таймер для каждого экрана
        });
    }

    updateScreenPosition(key, position, rotation, scale) {
        const screen = this.activeScreens.get(key);
        if (!screen) return;
        
        if (position) screen.mesh.position.set(position.x, position.y, position.z);
        if (rotation) {
            screen.mesh.rotation.set(
                THREE.MathUtils.degToRad(rotation.tiltX || 0),
                THREE.MathUtils.degToRad(rotation.tiltY || 0),
                THREE.MathUtils.degToRad(rotation.twistZ || 0)
            );
        }
        if (scale) screen.mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
    }

    removeScreen(key) {
        const screen = this.activeScreens.get(key);
        if (!screen) return;
        
        this.scene.remove(screen.mesh);
        screen.mesh.geometry.dispose();
        screen.material.dispose();
        this.activeScreens.delete(key);
    }

    clearAll() {
        for (const [, screen] of this.activeScreens) {
            this.scene.remove(screen.mesh);
            screen.mesh.geometry.dispose();
            screen.material.dispose();
        }
        this.activeScreens.clear();
    }

    updateScreenFrame(screenData, frame) {
        const { canvas, ctx, config } = screenData;
        const w = config.width;
        const h = config.height;
        
        // Быстрая очистка
        ctx.fillStyle = '#000505';
        ctx.fillRect(0, 0, w, h);
        
        const patternIndex = Math.floor(frame / 4) % 3;
        ctx.fillStyle = '#' + config.color.toString(16).padStart(6, '0');
        
        if (patternIndex === 0) {
            // Простые полосы
            for (let i = 0; i < 3; i++) {
                if (Math.random() > 0.5) ctx.fillRect(5, 5 + i * 8, w - 10, 4);
            }
        } else if (patternIndex === 1) {
            // Шум
            for (let i = 0; i < 20; i++) {
                ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
            }
        } else {
            // Линия
            ctx.fillRect((frame * 3) % w, h / 2, 20, 2);
        }
    }

    /**
     * Обновляет экраны. 
     * cameraPos нужен для LOD, camera нужна для проверки видимости (опционально)
     */
    update(deltaTime, cameraPos, camera) {
        const now = performance.now();
        this.frameCount++;

        for (const [key, screen] of this.activeScreens) {
            // 1. Проверка дистанции (LOD)
            const distSq = screen.mesh.position.distanceToSquared(cameraPos);
            
            // Если экран дальше 120 единиц, отключаем анимацию и делаем его тусклым
            if (distSq > 14400) { 
                if (screen.material.opacity !== 0.3) {
                    screen.material.opacity = 0.3;
                    // Можно даже отключить карту текстуры для дальних объектов, если нужно
                    // screen.material.map = null; 
                }
                continue;
            }

            // 2. Проверка частоты обновления (не каждый кадр!)
            const typeConfig = this.screenTypes[screen.type];
            if (now - screen.lastUpdate < typeConfig.interval) continue;
            
            screen.lastUpdate = now;

            // 3. Обновление текстуры
            this.updateScreenFrame(screen.screenData, this.frameCount);
            screen.screenData.texture.needsUpdate = true;
            
            // Мерцание
            screen.material.opacity = 0.7 + Math.random() * 0.3;
        }
    }
}

export default ScreenManager;

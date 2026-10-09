// src/render/screenManager.js
// @ts-check
/**
 * ScreenManager - управление анимированными экранами
 * Отвечает за создание, обновление и анимацию светящихся панелей
 * Исправлено для работы с MeshBasicMaterial (без emissive)
 */

import * as THREE from 'three';

class ScreenManager {
    constructor(scene) {
        this.scene = scene;
        
        // Активные экраны: Map<key, {mesh, material, screenData, baseColor, type}>
        this.activeScreens = new Map();
        
        // Кэш текстур для переиспользования
        this.textureCache = new Map();
        
        // Типы экранов с параметрами
        this.screenTypes = {
            monitor: {
                width: 64,
                height: 32,
                emissiveColor: 0x00ff88, // Зеленый
                updateInterval: 150
            },
            panel: {
                width: 32,
                height: 16,
                emissiveColor: 0x00aaff, // Синий
                updateInterval: 200
            },
            display: {
                width: 48,
                height: 24,
                emissiveColor: 0xff6600, // Оранжевый
                updateInterval: 100
            }
        };
        
        // Счетчик кадров для анимации
        this.frameCount = 0;
        
        // Время последнего обновления
        this.lastUpdateTime = 0;
    }

    /**
     * Создает canvas-текстуру для экрана (с кэшированием)
     */
    createScreenTexture(type = 'monitor') {
        const config = this.screenTypes[type] || this.screenTypes.monitor;
        const cacheKey = `${type}_${config.width}x${config.height}`;
        
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey);
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = config.width;
        canvas.height = config.height;
        const ctx = canvas.getContext('2d');
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; // Пиксельный вид
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        const result = { canvas, texture, config, ctx };
        this.textureCache.set(cacheKey, result);
        
        return result;
    }

    /**
     * Добавляет экран в сцену
     */
    addScreen(key, position, rotation, scale, type = 'monitor') {
        // Если экран уже существует, обновляем его
        if (this.activeScreens.has(key)) {
            this.updateScreenPosition(key, position, rotation, scale);
            return;
        }
        
        const screenData = this.createScreenTexture(type);
        const config = this.screenTypes[type];
        const baseColor = new THREE.Color(config.emissiveColor);
        
        // === ИСПРАВЛЕННЫЙ МАТЕРИАЛ ===
        // MeshBasicMaterial не имеет emissive, используем color для "свечения"
        const material = new THREE.MeshBasicMaterial({
            map: screenData.texture,
            color: baseColor,          // Яркий цвет вместо emissive
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false          // Избегаем артефактов прозрачности
        });
        // =============================
        
        // Геометрия плоскости
        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        
        // Устанавливаем позицию, поворот и масштаб
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(
            THREE.MathUtils.degToRad(rotation.tiltX || 0),
            THREE.MathUtils.degToRad(rotation.tiltY || 0),
            THREE.MathUtils.degToRad(rotation.twistZ || 0)
        );
        mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        
        // Добавляем в сцену
        this.scene.add(mesh);
        
        // Сохраняем ссылку
        this.activeScreens.set(key, {
            mesh,
            material,
            screenData,
            baseColor, // Сохраняем для корректного мерцания
            type
        });
    }

    /**
     * Обновляет позицию существующего экрана
     */
    updateScreenPosition(key, position, rotation, scale) {
        const screen = this.activeScreens.get(key);
        if (!screen) return;
        
        if (position) {
            screen.mesh.position.set(position.x, position.y, position.z);
        }
        if (rotation) {
            screen.mesh.rotation.set(
                THREE.MathUtils.degToRad(rotation.tiltX || 0),
                THREE.MathUtils.degToRad(rotation.tiltY || 0),
                THREE.MathUtils.degToRad(rotation.twistZ || 0)
            );
        }
        if (scale) {
            screen.mesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
        }
    }

    /**
     * Удаляет экран из сцены
     */
    removeScreen(key) {
        const screen = this.activeScreens.get(key);
        if (!screen) return;
        
        this.scene.remove(screen.mesh);
        screen.mesh.geometry.dispose();
        screen.material.dispose();
        
        this.activeScreens.delete(key);
    }

    /**
     * Очищает все экраны
     */
    clearAll() {
        for (const [key, screen] of this.activeScreens) {
            this.scene.remove(screen.mesh);
            screen.mesh.geometry.dispose();
            screen.material.dispose();
        }
        this.activeScreens.clear();
    }

    /**
     * Обновляет кадр анимации для одного экрана
     */
    updateScreenFrame(screenData, frame) {
        const { canvas, ctx, config } = screenData;
        const w = config.width;
        const h = config.height;
        
        // Очищаем canvas темным фоном
        ctx.fillStyle = '#001a11';
        ctx.fillRect(0, 0, w, h);
        
        // Выбираем паттерн на основе кадра
        const patternIndex = Math.floor(frame / 3) % 3;
        
        switch (patternIndex) {
            case 0:
                this.drawPatternBars(ctx, w, h, frame);
                break;
            case 1:
                this.drawPatternGrid(ctx, w, h, frame);
                break;
            case 2:
                this.drawPatternScanlines(ctx, w, h, frame);
                break;
        }
    }

    /**
     * Паттерн: мигающие полосы
     */
    drawPatternBars(ctx, w, h, frame) {
        const color = frame % 2 ? '#00ff88' : '#00cc66';
        ctx.fillStyle = color;
        
        for (let i = 0; i < 4; i++) {
            if (Math.random() > 0.3) {
                const y = 8 + i * 6;
                const width = 20 + Math.random() * 30;
                ctx.fillRect(5, y, Math.min(width, w - 10), 3);
            }
        }
    }

    /**
     * Паттерн: сетка точек
     */
    drawPatternGrid(ctx, w, h, frame) {
        ctx.fillStyle = '#00ff88';
        
        for (let x = 4; x < w; x += 8) {
            for (let y = 4; y < h; y += 8) {
                if (Math.random() > 0.5) {
                    ctx.fillRect(x, y, 2, 2);
                }
            }
        }
    }

    /**
     * Паттерн: бегущие линии
     */
    drawPatternScanlines(ctx, w, h, frame) {
        const offset = (frame * 2) % w;
        ctx.fillStyle = '#00ff88';
        
        // Бегущая горизонтальная линия
        ctx.fillRect(offset, Math.floor(h / 2), 15, 2);
        
        // Вертикальные полоски
        for (let i = 0; i < 3; i++) {
            if (Math.random() > 0.4) {
                const x = i * 20 + 5;
                ctx.fillRect(x, 5, 2, h - 10);
            }
        }
    }

    /**
     * Обновляет все активные экраны (вызывается каждый кадр)
     */
    update(deltaTime, cameraPos) { // Добавили cameraPos
        const now = Date.now();
        if (now - this.lastUpdateTime < 100) return;
        
        this.lastUpdateTime = now;
        this.frameCount++;

        for (const [key, screen] of this.activeScreens) {
            // === ОПТИМИЗАЦИЯ: Проверка дистанции ===
            const distSq = screen.mesh.position.distanceToSquared(cameraPos);
            
            // Если экран дальше 150 единиц, просто мерцаем прозрачностью, не перерисовывая Canvas
            if (distSq > 22500) {
                const flicker = 0.7 + Math.random() * 0.3;
                screen.material.opacity = flicker;
                continue; // Пропускаем тяжелую отрисовку паттерна
            }
            // ==========================================

            // Обновляем текстуру только для близких экранов
            this.updateScreenFrame(screen.screenData, this.frameCount);
            screen.screenData.texture.needsUpdate = true;
            
            const flicker = 0.7 + Math.random() * 0.3;
            screen.material.opacity = flicker;
        }
    }

    /**
     * Получает количество активных экранов
     */
    getActiveCount() {
        return this.activeScreens.size;
    }
}

export default ScreenManager;

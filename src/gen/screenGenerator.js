// src/gen/screenGenerator.js
// @ts-check
/**
 * Генератор светящихся экранов и панелей
 * Создает плоскости с анимированными текстурами через Canvas
 * Минимальная нагрузка на CPU, без GPU-шейдеров
 */

import * as THREE from 'three';

class ScreenGenerator {
    constructor() {
        // Кэш canvas-текстур для переиспользования
        this.textureCache = new Map();
        
        // Типы экранов с разными паттернами
        this.screenTypes = {
            monitor: {
                width: 64,
                height: 32,
                updateInterval: 150, // мс между кадрами
                emissiveColor: 0x00ff88,
                emissiveIntensity: 0.8
            },
            panel: {
                width: 32,
                height: 16,
                updateInterval: 200,
                emissiveColor: 0x00aaff,
                emissiveIntensity: 0.6
            },
            display: {
                width: 48,
                height: 24,
                updateInterval: 100,
                emissiveColor: 0xff6600,
                emissiveIntensity: 0.9
            }
        };
    }

    /**
     * Создает canvas-текстуру для экрана
     * @param {string} type - тип экрана (monitor|panel|display)
     * @returns {{canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, config: Object}}
     */
    createScreenTexture(type = 'monitor') {
        const config = this.screenTypes[type] || this.screenTypes.monitor;
        const cacheKey = `${type}_${config.width}x${config.height}`;
        
        // Проверяем кэш
        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey);
        }
        
        // Создаем canvas
        const canvas = document.createElement('canvas');
        canvas.width = config.width;
        canvas.height = config.height;
        const ctx = canvas.getContext('2d');
        
        // Создаем текстуру
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; // пиксельный вид
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        const result = { canvas, texture, config, ctx };
        this.textureCache.set(cacheKey, result);
        
        return result;
    }

    /**
     * Обновляет кадр анимации экрана
     * @param {Object} screenData - данные экрана из createScreenTexture
     * @param {number} frame - номер кадра
     */
    updateScreenFrame(screenData, frame) {
        const { canvas, ctx, config } = screenData;
        const w = config.width;
        const h = config.height;
        
        // Очищаем canvas
        ctx.fillStyle = '#001a11';
        ctx.fillRect(0, 0, w, h);
        
        // Рисуем паттерн в зависимости от типа
        switch (true) {
            case frame % 3 === 0:
                this.drawPatternBars(ctx, w, h, frame);
                break;
            case frame % 3 === 1:
                this.drawPatternGrid(ctx, w, h, frame);
                break;
            default:
                this.drawPatternScanlines(ctx, w, h, frame);
        }
    }

    /**
     * Паттерн: мигающие полосы
     */
    drawPatternBars(ctx, w, h, frame) {
        const color = frame % 2 ? '#00ff88' : '#00cc66';
        ctx.fillStyle = color;
        
        // Горизонтальные полосы
        for (let i = 0; i < 4; i++) {
            if (Math.random() > 0.3) {
                const y = 8 + i * 6;
                const width = 20 + Math.random() * 30;
                ctx.fillRect(5, y, width, 3);
            }
        }
    }

    /**
     * Паттерн: сетка точек
     */
    drawPatternGrid(ctx, w, h, frame) {
        ctx.fillStyle = '#00ff88';
        
        // Сетка точек
        for (let x = 4; x < w; x += 8) {
            for (let y = 4; y < h; y += 8) {
                if (Math.random() > 0.5) {
                    ctx.fillRect(x, y, 2, 2);
                }
            }
        }
    }

    /**
     * Паттерн: бегущие линии (scanlines)
     */
    drawPatternScanlines(ctx, w, h, frame) {
        const offset = (frame * 2) % w;
        ctx.fillStyle = '#00ff88';
        
        // Бегущая горизонтальная линия
        ctx.fillRect(offset, h / 2, 15, 2);
        
        // Вертикальные полоски
        for (let i = 0; i < 3; i++) {
            if (Math.random() > 0.4) {
                const x = i * 20 + 5;
                ctx.fillRect(x, 5, 2, h - 10);
            }
        }
    }

    /**
     * Создает меш экрана с материалом
     * @param {string} type - тип экрана
     * @param {number} width - ширина меша
     * @param {number} height - высота меша
     * @returns {{mesh: THREE.Mesh, screenData: Object, material: THREE.MeshBasicMaterial}}
     */
    createScreenMesh(type = 'monitor', width = 1, height = 0.5) {
        const screenData = this.createScreenTexture(type);
        const config = this.screenTypes[type];
        
        // Создаем материал со свечением
        const material = new THREE.MeshBasicMaterial({
            map: screenData.texture,
            emissive: new THREE.Color(config.emissiveColor),
            emissiveIntensity: config.emissiveIntensity,
            transparent: true,
            opacity: 0.95
        });
        
        // Геометрия плоскости
        const geometry = new THREE.PlaneGeometry(width, height);
        const mesh = new THREE.Mesh(geometry, material);
        
        // Поворачиваем чтобы смотрела вперед
        mesh.rotation.y = 0;
        
        return { mesh, screenData, material };
    }

    /**
     * Запускает анимацию для всех активных экранов
     * @param {Array} screens - массив объектов {screenData, material}
     */
    animateScreens(screens) {
        let frame = 0;
        
        const updateLoop = () => {
            frame++;
            
            screens.forEach(({ screenData, material }) => {
                // Обновляем кадр текстуры
                this.updateScreenFrame(screenData, frame);
                screenData.texture.needsUpdate = true;
                
                // Мерцаем интенсивностью свечения
                const flicker = 0.7 + Math.random() * 0.3;
                material.emissiveIntensity *= flicker;
            });
            
            requestAnimationFrame(updateLoop);
        };
        
        updateLoop();
    }

    /**
     * Генерирует примитивы экранов для чанка (интеграция с chunkGenerator)
     * @param {number} cx - координата чанка X
     * @param {number} cy - координата чанка Y  
     * @param {number} cz - координата чанка Z
     * @param {number} seed - сид мира
     * @param {Object} config - конфигурация
     * @param {Function} rng - функция RNG
     * @param {Object} bounds - границы чанка
     * @returns {Array} массив PrimitiveRecord для экранов
     */
    generateScreensForChunk(cx, cy, cz, seed, config, rng, bounds) {
        const primitives = [];
        const { decorDensity } = config;
        
        // Плотность экранов (берем из decorDensity.panels или создаем отдельный параметр)
        const screenDensity = decorDensity?.panels || 0.04;
        
        const area = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
        const count = Math.floor(area * screenDensity / 500); // меньше плотность чем у обычного декора
        
        const types = ['monitor', 'panel', 'display'];
        
        for (let i = 0; i < count; i++) {
            // Детерминированное решение о размещении
            const hash = this.hashPosition(cx, cy, cz, i, seed);
            
            if (hash < screenDensity) {
                const type = types[Math.floor(hash * types.length)];
                const wx = bounds.min.x + rng() * (bounds.max.x - bounds.min.x);
                const wy = bounds.min.y + rng() * (bounds.max.y - bounds.min.y);
                const wz = bounds.min.z + rng() * (bounds.max.z - bounds.min.z);
                
                // Размеры экрана
                const screenWidth = 0.8 + rng() * 1.2;
                const screenHeight = 0.4 + rng() * 0.6;
                
                primitives.push({
                    type: 'screen',
                    screenType: type,
                    position: { x: wx, y: wy, z: wz },
                    rotation: { 
                        tiltX: (rng() - 0.5) * 30, // небольшой наклон
                        tiltY: rng() * 360, // случайный поворот вокруг Y
                        twistZ: 0 
                    },
                    scale: { 
                        x: screenWidth, 
                        y: screenHeight, 
                        z: 0.05 // тонкая панель
                    },
                    paletteSlot: 'glow',
                    role: 'decor',
                    flags: { emissive: true }
                });
            }
        }
        
        return primitives;
    }

    /**
     * Хеш для детерминированного размещения
     */
    hashPosition(cx, cy, cz, index, seed) {
        // Простой хеш на основе координат
        let h = seed;
        h = Math.imul(h ^ cx, 0x5bd1e995);
        h = Math.imul(h ^ cy, 0x5bd1e995);
        h = Math.imul(h ^ cz, 0x5bd1e995);
        h = Math.imul(h ^ index, 0x5bd1e995);
        h ^= h >>> 13;
        h = Math.imul(h, 0x5bd1e995);
        h ^= h >>> 15;
        return ((h >>> 0) & 0x7fffffff) / 0x7fffffff;
    }
}

export default new ScreenGenerator();

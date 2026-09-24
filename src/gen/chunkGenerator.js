// src/gen/chunkGenerator.js
// @ts-check
import { createRNG, hash3D } from '../core/rng.js';
import { chunkToBounds } from '../core/chunkKey.js';
import edgeAgreement from './edgeAgreement.js';

export function generateChunk(cx, cy, cz, seed, config) {
    const primitives = [];
    const chunkSeed = hash3D(cx, cy, cz, seed);
    const rng = createRNG(Math.floor(chunkSeed * 1000000));
    const bounds = chunkToBounds(cx, cy, cz, config.chunkSize);
    const cellSize = config.chunkSize / config.gridSize;
    
    let instanceCount = 0;
    const maxInstances = config.maxInstancesPerChunk || 30000;

    // === ЭТАП A: Платформы + Встроенные лестницы (Y-up) ===
    const platforms = generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize);
    primitives.push(...platforms);
    instanceCount += platforms.length;

    // === ЭТАП B: Комнаты и стены (Y-up) ===
    if (instanceCount < maxInstances) {
        const rooms = generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...rooms);
        instanceCount += rooms.length;
    }

    // === ЭТАП C: Горизонтальные мосты (Y-up) ===
    if (instanceCount < maxInstances) {
        const connections = generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize);
        primitives.push(...connections);
        instanceCount += connections.length;
    }

    // === ЭТАП D: Монолиты (Y-up) ===
    if (instanceCount < maxInstances) {
        const mega = generateMegaStructures(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...mega);
        instanceCount += mega.length;
    }

    // === ЭТАП E: Протыкающие фигуры (Y-up) ===
    if (instanceCount < maxInstances) {
        const pierce = generatePierce(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...pierce);
        instanceCount += pierce.length;
    }

    // === ЭТАП F: Декор (Y-up) ===
    if (instanceCount < maxInstances) {
        const decor = generateDecor(cx, cy, cz, seed, config, rng, bounds);
        primitives.push(...decor);
        instanceCount += decor.length;
    }

    return primitives;
}

/**
 * Этап A: Генерация платформ + ЛЕСТНИЦЫ ПО АЛГОРИТМУ "ПУСТОТА МЕЖДУ" (Y-up)
 */
function generatePlatforms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { levelHeight, platformThickness, gridSize, roomDensity, stairsChance } = config;
    
    // Диапазон уровней по Y (высота в системе Y-up)
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        const yBase = level * levelHeight; 
        
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const baseHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed);
                if (baseHash >= roomDensity) continue;

                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize; 
                
                // === АЛГОРИТМ ПОИСКА ЛЕСТНИЦЫ: [Платформа L] -> [Пусто L+1] -> [Платформа L+1] ===
                let stairType = null;
                
                if (level < endLevel && rng() < stairsChance) {
                    const targetLevel = level + 1;
                    
                    // Направления: [dx, dy, тип_лестницы]
                    const directions = [
                        { dx: 0, dy: -1, type: 'stair_south' }, // Юг (-Z)
                        { dx: 0, dy: 1, type: 'stair_north' },  // Север (+Z)
                        { dx: -1, dy: 0, type: 'stair_west' },  // Запад (-X)
                        { dx: 1, dy: 0, type: 'stair_east' }    // Восток (+X)
                    ];
                    
                    for (const dir of directions) {
                        const midX = gx + dir.dx;   // Промежуточная клетка (должна быть пустой на L+1)
                        const midY = gy + dir.dy;
                        const targetX = gx + dir.dx * 2; // Целевая клетка (должна быть занятой на L+1)
                        const targetY = gy + dir.dy * 2;

                        // Проверка границ грида для обеих клеток
                        if (targetX >= 0 && targetX < gridSize && targetY >= 0 && targetY < gridSize) {
                            // 1. Промежуток должен быть ПУСТЫМ на УРОВНЕ ВЫШЕ (L+1)
                            const midEmpty = hash3D(
                                cx * gridSize + midX, 
                                cy * gridSize + midY, 
                                targetLevel, 
                                seed
                            ) >= roomDensity;
                            
                            // 2. Цель должна быть ЗАНЯТА на УРОВНЕ ВЫШЕ (L+1)
                            const targetOccupied = hash3D(
                                cx * gridSize + targetX, 
                                cy * gridSize + targetY, 
                                targetLevel, 
                                seed
                            ) < roomDensity;
                            
                            if (midEmpty && targetOccupied) {
                                stairType = dir.type;
                                break; // Нашли первое подходящее направление по паттерну
                            }
                        }
                    }
                }

                if (stairType) {
                    // === ПЛАТФОРМА С ЛЕСТНИЦЕЙ ===
                    // КЛЮЧЕВОЙ МОМЕНТ: Передаем params для корректной сборки геометрии
                    primitives.push({
                        type: stairType,
                        position: { x: wx, y: yBase, z: wz }, 
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: levelHeight, z: cellSize },
                        paletteSlot: 'accent',
                        role: 'connector',
                        params: { platformThickness, levelHeight } // <-- Для фабрики
                    });
                } else {
                    // === ОБЫЧНАЯ ПЛАТФОРМА ===
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yBase + platformThickness / 2, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize, y: platformThickness, z: cellSize },
                        paletteSlot: 'base',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

function generateRooms(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { wallDensity, pillarDensity, levelHeight, gridSize, roomDensity, platformThickness } = config;
    
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);

    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const yBase = level * levelHeight;
        const yWallCenter = yBase + platformThickness + (levelHeight - platformThickness) / 2; 

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const wx = bounds.min.x + (gx + 0.5) * cellSize;
                const wz = bounds.min.z + (gy + 0.5) * cellSize;

                const wallHash = hash3D(cx * gridSize + gx, cy * gridSize + gy, level + 0.5, seed);
                if (wallHash < wallDensity) {
                    primitives.push({
                        type: 'box',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.9, y: levelHeight, z: cellSize * 0.1 },
                        paletteSlot: 'baseDark',
                        role: 'frame'
                    });
                }

                const pillarHash = hash3D(cx * gridSize + gx + 0.5, cy * gridSize + gy + 0.5, level, seed);
                if (pillarHash < pillarDensity) {
                    primitives.push({
                        type: 'cylinder',
                        position: { x: wx, y: yWallCenter, z: wz },
                        rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                        scale: { x: cellSize * 0.15, y: levelHeight, z: cellSize * 0.15 },
                        paletteSlot: 'accent',
                        role: 'frame'
                    });
                }
            }
        }
    }
    return primitives;
}

// src/gen/chunkGenerator.js

function generateConnections(cx, cy, cz, seed, config, rng, bounds, cellSize) {
    const primitives = [];
    const { gridSize, levelHeight, roomDensity, bridgeChance, platformThickness } = config; // Добавил platformThickness
    const startLevel = Math.ceil(bounds.min.y / levelHeight);
    const endLevel = Math.floor(bounds.max.y / levelHeight);
    
    for (let level = startLevel; level <= endLevel; level++) {
        if (hash3D(cx, cy, level, seed) > roomDensity) continue;
        
        const yBase = level * levelHeight;
        const platforms = [];
        const platformSet = new Set();
        
        // Собираем все платформы на этом уровне
        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                if (hash3D(cx * gridSize + gx, cy * gridSize + gy, level, seed) < roomDensity) {
                    platforms.push({ gx, gy });
                    platformSet.add(`${gx},${gy}`);
                }
            }
        }
        
        if (platforms.length < 2) continue;
        
        // Алгоритм Prim's для связности
        const connected = new Set([`${platforms[0].gx},${platforms[0].gy}`]);
        const edgesToAdd = [];
        let safety = 0;
        
        while (connected.size < platforms.length && safety++ < 500) {
            const keys = Array.from(connected);
            const srcKey = keys[Math.floor(rng() * keys.length)];
            const [sx, sy] = srcKey.split(',').map(Number);
            
            let nearest = null, minDist = Infinity;
            
            // Ищем ближайшую несвязанную платформу
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = sx + dx, ny = sy + dy;
                    const k = `${nx},${ny}`;
                    
                    if (platformSet.has(k) && !connected.has(k)) {
                        const d = Math.abs(dx) + Math.abs(dy);
                        if (d < minDist) { 
                            minDist = d; 
                            nearest = { gx: nx, gy: ny }; 
                        }
                    }
                }
            }
            
            if (nearest) {
                connected.add(`${nearest.gx},${nearest.gy}`);
                edgesToAdd.push({ sx, sy, tx: nearest.gx, ty: nearest.gy });
            }
        }
        
        // Создаем мосты для каждого ребра
        for (const e of edgesToAdd) {
            const x1 = bounds.min.x + (e.sx + 0.5) * cellSize;
            const z1 = bounds.min.z + (e.sy + 0.5) * cellSize;
            const x2 = bounds.min.x + (e.tx + 0.5) * cellSize;
            const z2 = bounds.min.z + (e.ty + 0.5) * cellSize;
            
            // Центр моста
            const midX = (x1 + x2) / 2;
            const midZ = (z1 + z2) / 2;
            
            // Длина моста
            const dist = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
            
            // Угол поворота в плоскости XZ (вокруг оси Y!)
            const angleRad = Math.atan2(z2 - z1, x2 - x1);
            const angleDeg = angleRad * (180 / Math.PI);
            
            // Добавляем небольшой отступ от краев платформ для эстетики
            const bridgeLength = Math.max(dist - cellSize * 0.3, 1);
            
            primitives.push({
                type: 'box',
                position: { 
                    x: midX, 
                    y: yBase + platformThickness + 0.5, // Чуть выше поверхности платформы
                    z: midZ 
                },
                rotation: { 
                    tiltX: 0, 
                    tiltY: angleDeg,  // <-- ИСПРАВЛЕНО: поворот вокруг Y для горизонтали
                    twistZ: 0 
                },
                scale: { 
                    x: bridgeLength,  // Длина вдоль локальной X
                    y: 0.5,           // Толщина
                    z: cellSize * 0.3 // Ширина моста
                },
                paletteSlot: 'accent',
                role: 'connector'
            });
        }
    }
    
    return primitives;
}

function generateMegaStructures(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { megaBlockChance, megaBlockMinHeight, megaBlockMaxHeight, levelHeight } = config;
    
    for (let i = 0; i < 3; i++) {
        if (hash3D(cx, cy, cz + i*0.3, seed) < megaBlockChance) {
            const h = (megaBlockMinHeight + rng()*(megaBlockMaxHeight-megaBlockMinHeight)) * levelHeight;
            primitives.push({
                type: 'box',
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { tiltX: 0, tiltY: 0, twistZ: 0 },
                scale: { x: 10+rng()*20, y: h, z: 10+rng()*20 },
                paletteSlot: 'baseDark',
                role: 'frame'
            });
        }
    }
    return primitives;
}

function generatePierce(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { scatterDensity, pierceWeights, pierceMinHeight, pierceMaxHeight, pierceMaxTilt } = config;
    if (!pierceWeights) return primitives;

    const area = (bounds.max.x-bounds.min.x) * (bounds.max.z-bounds.min.z);
    const count = Math.floor(area * scatterDensity / 1000);
    
    const types = Object.entries(pierceWeights).map(([t,w]) => ({item:t, weight:w}));
    const totalW = types.reduce((s,t) => s+t.weight, 0);

    for (let i=0; i<count; i++) {
        if (hash3D(cx, cy, cz+i*0.7, seed) < scatterDensity) {
            let r = rng()*totalW, sel='cylinder';
            for (const t of types) { r-=t.weight; if(r<=0){sel=t.item; break;} }
            
            const h = pierceMinHeight + rng()*(pierceMaxHeight-pierceMinHeight);
            primitives.push({
                type: sel,
                position: { 
                    x: bounds.min.x + rng()*(bounds.max.x-bounds.min.x), 
                    y: bounds.min.y + h/2, 
                    z: bounds.min.z + rng()*(bounds.max.z-bounds.min.z) 
                },
                rotation: { 
                    tiltX: (rng()-0.5)*2*pierceMaxTilt, 
                    tiltY: (rng()-0.5)*2*pierceMaxTilt, 
                    twistZ: 0 
                },
                scale: { x: 2+rng()*3, y: h, z: 2+rng()*3 },
                paletteSlot: 'accent',
                role: 'pierce'
            });
        }
    }
    return primitives;
}

function generateDecor(cx, cy, cz, seed, config, rng, bounds) {
    const primitives = [];
    const { decorDensity } = config;
    if (!decorDensity) return primitives;

    const w = bounds.max.x-bounds.min.x;
    const d = bounds.max.z-bounds.min.z;

    for (let i=0; i<Math.floor(w*(decorDensity.antennas||0)); i++) {
        primitives.push({
            type: 'cylinder',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+10, z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:0.5, y:10+rng()*20, z:0.5 },
            paletteSlot: 'baseLight', role: 'decor'
        });
    }
    for (let i=0; i<Math.floor(w*(decorDensity.spheres||0)); i++) {
        primitives.push({
            type: 'sphere',
            position: { x: bounds.min.x+rng()*w, y: bounds.min.y+rng()*(bounds.max.y-bounds.min.y), z: bounds.min.z+rng()*d },
            rotation: { tiltX:0, tiltY:0, twistZ:0 },
            scale: { x:2+rng()*3, y:2+rng()*3, z:2+rng()*3 },
            paletteSlot: 'glow', role: 'decor'
        });
    }
    return primitives;
}

export default { generateChunk };

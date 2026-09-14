// @ts-check
/**
 * LRU-кэш для данных чанков
 * Хранит сгенерированные PrimitiveRecord[] чтобы избежать повторной генерации
 * При переполнении удаляет наименее недавно использованные записи
 */

class ChunkCache {
    /**
     * @param {number} maxSize - максимальное количество чанков в кэше
     */
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
        
        // Map сохраняет порядок вставки: первые элементы — самые старые
        // При доступе элемент перемещается в конец (становится "недавно использованным")
        /** @type {Map<string, Array>} */
        this.cache = new Map();
    }
    
    /**
     * Получить данные чанка из кэша
     * Если ключ найден, запись перемещается в конец (помечается как недавно использованная)
     * @param {string} key - ключ чанка (формат "cx,cy,cz")
     * @returns {Array|null} массив PrimitiveRecord или null если нет в кэше
     */
    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }
        
        // Перемещаем в конец Map (помечаем как recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        
        return value;
    }
    
    /**
     * Сохранить данные чанка в кэш
     * Если кэш переполнен, удаляется самый старый элемент
     * @param {string} key - ключ чанка
     * @param {Array} data - массив PrimitiveRecord
     */
    set(key, data) {
        // Если ключ уже есть, удаляем старую позицию перед добавлением новой
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Удаляем самый старый элемент (первый в Map)
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        
        // Добавляем в конец (самый "свежий")
        this.cache.set(key, data);
    }
    
    /**
     * Проверить наличие ключа в кэше (без обновления порядка использования)
     * @param {string} key 
     * @returns {boolean}
     */
    has(key) {
        return this.cache.has(key);
    }
    
    /**
     * Удалить конкретный ключ из кэша
     * @param {string} key 
     * @returns {boolean} true если элемент был удалён
     */
    delete(key) {
        return this.cache.delete(key);
    }
    
    /**
     * Очистить весь кэш
     */
    clear() {
        this.cache.clear();
    }
    
    /**
     * Текущий размер кэша
     * @returns {number}
     */
    get size() {
        return this.cache.size;
    }
    
    /**
     * Обновить максимальный размер кэша
     * Если новый размер меньше текущего, лишние старые элементы удаляются
     * @param {number} newMaxSize 
     */
    resize(newMaxSize) {
        this.maxSize = newMaxSize;
        
        // Удаляем лишние старые записи если кэш переполнен
        while (this.cache.size > this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }
}

export default ChunkCache;

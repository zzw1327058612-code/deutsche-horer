/**
 * 数据存储模块
 * 使用 localStorage 存储所有数据，支持导入/导出
 */
const Storage = (function() {

    const KEYS = {
        SAVED: 'dh_saved_items',       // 收藏的词条
        PLAYLISTS: 'dh_playlists',      // 播放夹列表
        SETTINGS: 'dh_settings',        // 全局设置
        REVIEW_LOG: 'dh_review_log',    // 艾宾浩斯复习记录
        PLAY_PROGRESS: 'dh_play_progress', // 播放进度
        THEME: 'dh_theme',              // 主题
    };

    function get(key, defaultValue = null) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : defaultValue;
        } catch(e) {
            return defaultValue;
        }
    }

    function set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch(e) {
            console.error('Storage set error:', e);
            return false;
        }
    }

    // ===== 收藏项 =====
    function getSavedItems() {
        return get(KEYS.SAVED, []);
    }

    function saveItem(item) {
        const items = getSavedItems();
        // 检查是否已存在
        const exist = items.find(i => i.de.toLowerCase() === item.de.toLowerCase());
        if (exist) return { success: false, error: '已存在' };

        const newItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            de: item.de,
            zh: item.zh || '',
            en: item.en || '',
            type: item.type || 'word',
            level: item.level || 'A1',
            importance: item.importance || 1, // 1-3 星
            createdAt: Date.now(),
            // 艾宾浩斯
            reviewStage: 0,       // 当前阶段索引
            reviewCount: 0,       // 复习次数
            lastReviewAt: null,   // 上次复习时间
            nextReviewAt: Date.now(), // 下次该复习的时间
        };
        items.push(newItem);
        set(KEYS.SAVED, items);
        return { success: true, item: newItem };
    }

    function deleteItem(id) {
        const items = getSavedItems().filter(i => i.id !== id);
        set(KEYS.SAVED, items);
        // 从所有播放夹中移除
        const playlists = getPlaylists();
        playlists.forEach(p => {
            p.items = p.items.filter(i => i !== id);
        });
        set(KEYS.PLAYLISTS, playlists);
    }

    function updateItem(id, updates) {
        const items = getSavedItems();
        const idx = items.findIndex(i => i.id === id);
        if (idx >= 0) {
            items[idx] = { ...items[idx], ...updates };
            set(KEYS.SAVED, items);
            return items[idx];
        }
        return null;
    }

    function getItem(id) {
        return getSavedItems().find(i => i.id === id);
    }

    function isSaved(deText) {
        const items = getSavedItems();
        return items.some(i => i.de.toLowerCase() === deText.toLowerCase());
    }

    function getItemByDe(deText) {
        const items = getSavedItems();
        return items.find(i => i.de.toLowerCase() === deText.toLowerCase());
    }

    // ===== 播放夹 =====
    function getPlaylists() {
        return get(KEYS.PLAYLISTS, []);
    }

    function createPlaylist(name) {
        const playlists = getPlaylists();
        const pl = {
            id: 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: name,
            items: [],          // item id 数组
            createdAt: Date.now(),
        };
        playlists.push(pl);
        set(KEYS.PLAYLISTS, playlists);
        return pl;
    }

    function deletePlaylist(id) {
        const playlists = getPlaylists().filter(p => p.id !== id);
        set(KEYS.PLAYLISTS, playlists);
        // 删除进度
        const progress = getPlayProgress();
        Object.keys(progress).forEach(k => {
            if (k.startsWith(id + '_')) delete progress[k];
        });
        set(KEYS.PLAY_PROGRESS, progress);
    }

    function updatePlaylist(id, updates) {
        const playlists = getPlaylists();
        const idx = playlists.findIndex(p => p.id === id);
        if (idx >= 0) {
            playlists[idx] = { ...playlists[idx], ...updates };
            set(KEYS.PLAYLISTS, playlists);
            return playlists[idx];
        }
        return null;
    }

    function addToPlaylist(playlistId, itemId) {
        const playlists = getPlaylists();
        const pl = playlists.find(p => p.id === playlistId);
        if (pl && !pl.items.includes(itemId)) {
            pl.items.push(itemId);
            set(KEYS.PLAYLISTS, playlists);
            return true;
        }
        return false;
    }

    function removeFromPlaylist(playlistId, itemId) {
        const playlists = getPlaylists();
        const pl = playlists.find(p => p.id === playlistId);
        if (pl) {
            pl.items = pl.items.filter(i => i !== itemId);
            set(KEYS.PLAYLISTS, playlists);
        }
    }

    function reorderPlaylist(playlistId, newOrder) {
        const playlists = getPlaylists();
        const pl = playlists.find(p => p.id === playlistId);
        if (pl) {
            pl.items = newOrder;
            set(KEYS.PLAYLISTS, playlists);
        }
    }

    // ===== 播放进度 =====
    function getPlayProgress() {
        return get(KEYS.PLAY_PROGRESS, {});
    }

    function savePlayProgress(playlistId, index) {
        const progress = getPlayProgress();
        progress[playlistId] = { index, time: Date.now() };
        set(KEYS.PLAY_PROGRESS, progress);
    }

    function getPlayProgressFor(playlistId) {
        const progress = getPlayProgress();
        return progress[playlistId] || null;
    }

    function clearPlayProgress(playlistId) {
        const progress = getPlayProgress();
        delete progress[playlistId];
        set(KEYS.PLAY_PROGRESS, progress);
    }

    // ===== 设置 =====
    function getSettings() {
        return get(KEYS.SETTINGS, {
            rate: 1.0,              // 播放速度
            repeatCount: 3,         // 每条重复次数
            intervalSec: 2,         // 每条之间的间隔秒数
            autoNext: true,         // 自动播放下一条
            reviewIntervalMode: 'ebbinghaus', // 复习模式
        });
    }

    function saveSettings(settings) {
        const current = getSettings();
        set(KEYS.SETTINGS, { ...current, ...settings });
    }

    // ===== 主题 =====
    function getTheme() {
        return get(KEYS.THEME, 'light');
    }

    function setTheme(theme) {
        set(KEYS.THEME, theme);
    }

    // ===== 导入导出 =====
    function exportAll() {
        return {
            saved: getSavedItems(),
            playlists: getPlaylists(),
            settings: getSettings(),
            progress: getPlayProgress(),
            reviewLog: getReviewLog(),
            version: 1,
            exportedAt: new Date().toISOString(),
        };
    }

    function importAll(data) {
        if (!data || data.version !== 1) return false;
        try {
            if (data.saved) set(KEYS.SAVED, data.saved);
            if (data.playlists) set(KEYS.PLAYLISTS, data.playlists);
            if (data.settings) set(KEYS.SETTINGS, data.settings);
            if (data.progress) set(KEYS.PLAY_PROGRESS, data.progress);
            if (data.reviewLog) set(KEYS.REVIEW_LOG, data.reviewLog);
            return true;
        } catch(e) {
            return false;
        }
    }

    // ===== 复习记录 =====
    function getReviewLog() {
        return get(KEYS.REVIEW_LOG, []);
    }

    function addReviewLog(itemId, stage, correct) {
        const log = getReviewLog();
        log.push({
            itemId,
            stage,
            correct,
            time: Date.now(),
        });
        set(KEYS.REVIEW_LOG, log);
    }

    return {
        getSavedItems,
        saveItem,
        deleteItem,
        updateItem,
        getItem,
        isSaved,
        getItemByDe,
        getPlaylists,
        createPlaylist,
        deletePlaylist,
        updatePlaylist,
        addToPlaylist,
        removeFromPlaylist,
        reorderPlaylist,
        getPlayProgress,
        savePlayProgress,
        getPlayProgressFor,
        clearPlayProgress,
        getSettings,
        saveSettings,
        getTheme,
        setTheme,
        exportAll,
        importAll,
        getReviewLog,
        addReviewLog,
    };
})();

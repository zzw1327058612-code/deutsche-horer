/**
 * Service Worker - Deutsch Hörer
 * 离线缓存 + 后台播放支持
 */

const CACHE_NAME = 'deutsch-horer-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './icon.svg',
    './data/dictionary.js',
    './js/storage.js',
    './js/tts.js',
    './js/audio.js',
    './js/recorder.js',
    './js/ebbinghaus.js',
    './js/app.js',
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
    // 只处理 GET 请求
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            // 优先返回缓存，同时后台更新
            const fetchPromise = fetch(event.request).then((response) => {
                // 成功获取则更新缓存
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => {
                // 网络失败，返回缓存
                return cached;
            });

            return cached || fetchPromise;
        })
    );
});

// 后台同步（预留）
self.addEventListener('sync', (event) => {
    // 未来可用于同步数据
});

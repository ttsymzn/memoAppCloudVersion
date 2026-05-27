const CACHE_NAME = 'memoapp-v2';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './css/auth.css',
    './css/ptr.css',
    './js/supabase.js',
    './js/auth.js',
    './js/calendar.js',
    './js/offline.js',
    './js/app.js',
    './icons/icon.svg',
];

// Hosts that must always go to the network (auth / API calls)
const BYPASS_HOSTS = [
    'supabase.co',
    'accounts.google.com',
    'apis.google.com',
    'oauth2.googleapis.com',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Let auth / API traffic go directly to the network
    if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

    // Navigation: network-first so updates are picked up, offline fallback to shell
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    return res;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Static assets: cache-first, network fallback + cache update
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request).then(res => {
                if (!res || res.status !== 200 || res.type === 'opaque') return res;
                const clone = res.clone();
                caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                return res;
            }).catch(() => null);
        })
    );
});

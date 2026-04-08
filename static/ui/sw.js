// Service Worker – TPV Hostelería
// Caché básica para funcionamiento offline

const CACHE_NAME = 'tpv-v2';
const ASSETS = [
    '/',
    '/es/tpv/',
    '/static/ui/css/common.css',
    '/static/ui/css/componentes/topbar.css',
    '/static/ui/css/componentes/footer.css',
    '/static/ui/js/common.js',
    '/static/ui/img/icon-512.png',
];

// Instalar: cachear assets estáticos
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activar: limpiar cachés antiguas
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first, fallback a caché
self.addEventListener('fetch', (e) => {
    // Solo cachear GET requests
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request)
            .then((res) => {
                // Guardar copia en caché
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});

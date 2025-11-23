/**
 * Service Worker for DesignedByBud Landing Page
 * Implements caching strategies for optimal repeat visitor performance
 */

const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `designedbybud-${CACHE_VERSION}`;

// Assets to precache on installation (critical resources)
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/landing-page.css',
    '/product-card.css',
    '/app.js',
    '/obj-viewer.js',
    '/graphics/DBB_LOGO.png',
    '/graphics/WebsiteBanner.webp'
];

// Runtime cache for 3D models (loaded on demand)
const RUNTIME_CACHE_NAME = `designedbybud-runtime-${CACHE_VERSION}`;

// Maximum age for cached items (in milliseconds)
const MAX_AGE = {
    static: 30 * 24 * 60 * 60 * 1000,  // 30 days for static assets
    models: 90 * 24 * 60 * 60 * 1000,  // 90 days for 3D models
    html: 1 * 60 * 60 * 1000           // 1 hour for HTML
};

/**
 * Install Event - Precache critical assets
 */
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Precaching critical assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete');
                // Force the waiting service worker to become the active service worker
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Precaching failed:', error);
            })
    );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Delete old cache versions
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE_NAME) {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activation complete');
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - Implement caching strategies
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external CDN resources (they have their own caching)
    if (url.origin !== location.origin &&
        (url.hostname.includes('cdnjs.cloudflare.com') ||
         url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('fonts.googleapis.com') ||
         url.hostname.includes('fonts.gstatic.com'))) {
        return;
    }

    // Skip API calls or external links
    if (!url.origin.includes(location.origin)) {
        return;
    }

    // Determine caching strategy based on request type
    if (isHTMLRequest(request)) {
        // HTML: Network-first (get fresh content, fallback to cache)
        event.respondWith(networkFirstStrategy(request, CACHE_NAME));
    } else if (is3DModelRequest(request)) {
        // 3D Models: Cache-first (large files, rarely change)
        event.respondWith(cacheFirstStrategy(request, RUNTIME_CACHE_NAME));
    } else {
        // Static assets (CSS, JS, images): Cache-first with update
        event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
    }
});

/**
 * Network-First Strategy
 * Try network first, fallback to cache if offline
 * Best for HTML content that may update frequently
 */
async function networkFirstStrategy(request, cacheName) {
    try {
        const networkResponse = await fetch(request);

        // Cache the fresh response for offline use
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        console.log('[Service Worker] Network failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Return offline page if available, or generic error
        return new Response('Offline - content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
                'Content-Type': 'text/plain'
            })
        });
    }
}

/**
 * Cache-First Strategy
 * Serve from cache if available, fetch and cache if not
 * Best for static assets that don't change often
 */
async function cacheFirstStrategy(request, cacheName) {
    // Try cache first
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        // Check if cache is stale
        const cacheDate = new Date(cachedResponse.headers.get('date'));
        const now = new Date();
        const maxAge = is3DModelRequest(request) ? MAX_AGE.models : MAX_AGE.static;

        if (now - cacheDate < maxAge) {
            console.log('[Service Worker] Serving from cache:', request.url);
            return cachedResponse;
        }
    }

    // Cache miss or stale, fetch from network
    try {
        console.log('[Service Worker] Fetching fresh:', request.url);
        const networkResponse = await fetch(request);

        // Cache the new response
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed, return stale cache if available
        if (cachedResponse) {
            console.log('[Service Worker] Network failed, serving stale cache:', request.url);
            return cachedResponse;
        }

        // No cache and network failed
        return new Response('Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Helper: Check if request is for HTML
 */
function isHTMLRequest(request) {
    const url = new URL(request.url);
    return request.headers.get('Accept')?.includes('text/html') ||
           url.pathname.endsWith('.html') ||
           url.pathname === '/';
}

/**
 * Helper: Check if request is for 3D model
 */
function is3DModelRequest(request) {
    return request.url.includes('/products/') &&
           (request.url.endsWith('.obj') ||
            request.url.endsWith('.mtl'));
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});

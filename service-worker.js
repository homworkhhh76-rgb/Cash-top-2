const CACHE_NAME = 'cash-top-2-static-v25';
const RUNTIME_CACHE = 'cash-top-2-runtime-v25';
const PRECACHE_URLS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
  'https://unpkg.com/html5-qrcode',
  './accounts.html',
  './admin.html',
  './admin.js',
  './accounting-engine.js',
  './app-icon.png',
  './barcode-tools.js',
  './cashtop-core.css',
  './cashtop-core.js',
  './cashtop-logo.png',
  './firebase-config.js',
  './firebase-sync.js',
  './icon-192.png',
  './icon-512.png',
  './login.js',
  './manufacturing.js',
  './invoices.js',
  './invoice-document.js',
  './qr.mp3',
  './barcode-generator.html',
  './branches.html',
  './cashier.html',
  './customer-groups.html',
  './customers.html',
  './index.html',
  './invoices.html',
  './journal.html',
  './manifest.webmanifest',
  './offline.html',
  './printer-settings.html',
  './products.html',
  './sales-offers.html',
  './tax-settings.html',
  './notifications.html',
  './storage-settings.html',
  './sands.html',
  './setting.html',
  './shortages.html',
  './suppliers.html',
  './units.html',
  './warehouses.html',
  './ادارة التصنيع.html',
  './استيراد وتصدير ل كل قسم.html',
  './التقارير.html',
  './العمال والاجور.html',
  './المشتريات.html',
  './المصاريف.html',
  './المناديب.html',
  './الموظفين.html',
  './صفحة تسجيل الدخول.html',
  './لوحة التحكم.html',
  './مرجع المشتريات.html'
];

const REMOTE_STYLE_URLS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

async function cacheRemoteStylesAndFonts(cache) {
  await Promise.allSettled(REMOTE_STYLE_URLS.map(async styleUrl => {
    const response = await fetch(styleUrl);
    if (!response || (!response.ok && response.type !== 'opaque')) return;
    await cache.put(styleUrl, response.clone());
    if (response.type === 'opaque') return;
    const css = await response.text();
    const assetUrls = [...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)]
      .map(match => match[2])
      .filter(url => url && !url.startsWith('data:'))
      .map(url => new URL(url, styleUrl).href);
    await Promise.allSettled([...new Set(assetUrls)].map(async assetUrl => {
      const assetResponse = await fetch(assetUrl);
      if (assetResponse && (assetResponse.ok || assetResponse.type === 'opaque')) await cache.put(assetUrl, assetResponse);
    }));
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    await cacheRemoteStylesAndFonts(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => ![CACHE_NAME, RUNTIME_CACHE].includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});


async function networkFirst(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && (response.ok || response.type === 'opaque')) {
      await runtime.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return (await runtime.match(request, { ignoreSearch: true })) ||
      (await caches.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? (await caches.match('./offline.html')) : Response.error());
  }
}

async function cacheFirstWithRefresh(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const requestUrl = new URL(request.url);
  const ignoreSearch = request.mode === 'navigate' || requestUrl.origin === self.location.origin;
  let cached = await runtime.match(request, { ignoreSearch });
  if (!cached) cached = await caches.match(request, { ignoreSearch });

  // Always return the local cache immediately when available, even while online.
  if (cached) {
    fetch(request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) runtime.put(request, response.clone());
    }).catch(() => null);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) await runtime.put(request, response.clone());
    return response;
  } catch (_) {
    if (request.mode === 'navigate') return (await caches.match('./offline.html')) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // جميع الصفحات والأصول محلية أولاً؛ يتم تحديث النسخة في الخلفية عند توفر الإنترنت.
  event.respondWith(cacheFirstWithRefresh(request));
});

async function warmCache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
  await cacheRemoteStylesAndFonts(cache);
}

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'WARM_CACHE') event.waitUntil(warmCache());
});

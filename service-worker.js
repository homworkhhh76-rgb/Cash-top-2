'use strict';

const CACHE_VERSION = 'v34-cross-branch-warehouse-transfer';
const APP_CACHE = `cash-top-2-app-${CACHE_VERSION}`;
const REMOTE_STATIC_CACHE = `cash-top-2-remote-static-${CACHE_VERSION}`;

/*
 * حزمة التطبيق المحلية كاملة. التثبيت لا ينجح إلا بعد حفظ كل ملف محلي،
 * لذلك لا يستبدل الإصدار الجديد الكاش القديم بنسخة ناقصة.
 */
const LOCAL_ASSETS = [
  './accounting-engine.js',
  './accounts.html',
  './admin.html',
  './admin.js',
  './app-icon.png',
  './barcode-generator.html',
  './barcode-tools.js',
  './branches.html',
  './cashier.html',
  './cashtop-core.css',
  './cashtop-core.js',
  './cashtop-export.js',
  './cashtop-logo.png',
  './customer-groups.html',
  './customers.html',
  './firebase-config.js',
  './firebase-sync.js',
  './icon-192.png',
  './icon-512.png',
  './index.html',
  './invoice-document.js',
  './invoices.html',
  './invoices.js',
  './journal.html',
  './login.js',
  './manifest.webmanifest',
  './manufacturing.js',
  './notifications.html',
  './offline.html',
  './printer-settings.html',
  './products.html',
  './qr.mp3',
  './sales-offers.html',
  './sands.html',
  './setting.html',
  './shortages.html',
  './storage-settings.html',
  './suppliers.html',
  './tax-settings.html',
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

/* مكتبات العرض فقط. فشل أي مكتبة خارجية لا يمنع تثبيت التطبيق المحلي. */
const REMOTE_STATIC_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js',
  'https://unpkg.com/html5-qrcode'
];

const REMOTE_STATIC_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'www.gstatic.com'
]);

/*
 * هذه نطاقات بيانات حية. لا يجوز وضع استجاباتها في Cache Storage مطلقاً.
 * كان تخزين GET الخاص بـ Firebase هو سبب قراءة نسخة قديمة من بيانات الشركة
 * وعدم ظهور تعديلات الأجهزة الأخرى.
 */
function isLiveApiRequest(url) {
  const host = String(url.hostname || '').toLowerCase();
  return host.endsWith('.firebaseio.com') ||
    host.endsWith('.firebasedatabase.app') ||
    host === 'identitytoolkit.googleapis.com' ||
    host === 'securetoken.googleapis.com' ||
    host === 'firestore.googleapis.com' ||
    host === 'firebaseinstallations.googleapis.com' ||
    host === 'fcmregistrations.googleapis.com';
}

function isCacheableRemoteStatic(request, url) {
  if (!REMOTE_STATIC_HOSTS.has(url.hostname)) return false;
  if (request.destination && ['style', 'script', 'font', 'image', 'audio'].includes(request.destination)) return true;
  return /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|mp3)(?:$|\?)/i.test(url.pathname + url.search);
}

async function putIfUsable(cache, request, response) {
  if (!response) return response;
  if (response.ok || response.type === 'opaque') {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

async function fetchWithDeadline(request, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(request, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLocalAsset(asset) {
  const url = new URL(asset, self.registration.scope).href;
  const request = new Request(url, {
    method: 'GET',
    cache: 'reload',
    credentials: 'same-origin'
  });
  const response = await fetch(request);
  if (!response || !response.ok) throw new Error(`تعذر تخزين ملف التطبيق: ${asset}`);
  return { request, response };
}

async function installCompleteLocalShell() {
  const cache = await caches.open(APP_CACHE);
  const results = await Promise.all(LOCAL_ASSETS.map(fetchLocalAsset));
  await Promise.all(results.map(({ request, response }) => cache.put(request, response)));
}

async function cacheRemoteCssDependencies(cache, styleUrl, response) {
  if (!response || response.type === 'opaque' || !response.ok) return;
  const css = await response.clone().text();
  const urls = [...css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)]
    .map(match => match[2])
    .filter(Boolean)
    .filter(value => !value.startsWith('data:'))
    .map(value => new URL(value, styleUrl).href);
  await Promise.allSettled([...new Set(urls)].map(async assetUrl => {
    const req = new Request(assetUrl, { mode: 'cors', cache: 'reload' });
    const res = await fetchWithDeadline(req);
    await putIfUsable(cache, req, res);
  }));
}

async function warmRemoteStaticAssets() {
  const cache = await caches.open(REMOTE_STATIC_CACHE);
  await Promise.allSettled(REMOTE_STATIC_ASSETS.map(async url => {
    const request = new Request(url, { mode: 'cors', cache: 'reload' });
    const response = await fetchWithDeadline(request);
    await putIfUsable(cache, request, response);
    if (url.includes('fonts.googleapis.com') || url.endsWith('.css')) {
      await cacheRemoteCssDependencies(cache, url, response);
    }
  }));
}

async function ensureLocalShell() {
  const cache = await caches.open(APP_CACHE);
  const missing = [];
  for (const asset of LOCAL_ASSETS) {
    const url = new URL(asset, self.registration.scope).href;
    const hit = await cache.match(url, { ignoreSearch: true });
    if (!hit) missing.push(asset);
  }
  if (!missing.length) return { complete: true, missing: [] };
  const results = await Promise.allSettled(missing.map(fetchLocalAsset));
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    await cache.put(result.value.request, result.value.response);
  }
  const remaining = [];
  for (const asset of missing) {
    const url = new URL(asset, self.registration.scope).href;
    if (!(await cache.match(url, { ignoreSearch: true }))) remaining.push(asset);
  }
  return { complete: remaining.length === 0, missing: remaining };
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await installCompleteLocalShell();
    await warmRemoteStaticAssets();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, REMOTE_STATIC_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => !keep.has(name)).map(name => caches.delete(name)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

async function refreshLocalCache(request, cache) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return null;
  }
}

async function localCacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  // اعرض النسخة المحلية فوراً حتى مع وجود الإنترنت.
  if (cached) return cached;

  const response = await refreshLocalCache(request, cache);
  if (response) return response;
  if (request.mode === 'navigate') {
    return (await cache.match(new URL('./offline.html', self.registration.scope).href, { ignoreSearch: true })) || Response.error();
  }
  return Response.error();
}


async function refreshCachedLocalInBackground(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (!cached) return;
  await refreshLocalCache(request, cache);
}

async function remoteStaticCacheFirst(request) {
  const cache = await caches.open(REMOTE_STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    return await putIfUsable(cache, request, response);
  } catch (_) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  /* بيانات Firebase والـ APIs الحية تمر مباشرة بلا أي كاش. */
  if (isLiveApiRequest(url)) return;

  if (url.origin === self.location.origin) {
    event.respondWith(localCacheFirst(request));
    // تحديث صامت بعد تقديم النسخة المخبأة فوراً، لضمان السرعة مع بقاء الكاش حديثاً.
    event.waitUntil(refreshCachedLocalInBackground(request));
    return;
  }

  if (isCacheableRemoteStatic(request, url)) {
    event.respondWith(remoteStaticCacheFirst(request));
  }
  /* الروابط الخارجية الأخرى، مثل WhatsApp، تمر إلى الشبكة كما هي. */
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (data.type === 'WARM_CACHE' || data.type === 'VERIFY_CACHE') {
    event.waitUntil((async () => {
      const result = await ensureLocalShell();
      const source = event.source;
      if (source && typeof source.postMessage === 'function') {
        source.postMessage({ type: 'CASHTOP_CACHE_STATUS', ...result, cache: APP_CACHE });
      }
      /* لا نعيد طلب المكتبات الخارجية عند كل صفحة؛ تم حفظها أثناء التثبيت. */
    })());
  }
});

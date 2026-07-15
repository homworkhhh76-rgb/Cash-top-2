const settings = window.CASHTOP_FIREBASE || {};
const core = window.Cashtop;

if (settings.enabled && core && settings.config?.databaseURL && settings.config?.apiKey) {
  const cfg = settings.config;
  const AUTH_KEY = `ct_firebase_rest_auth_v3::${cfg.projectId || 'default'}`;
  const STATE_KEY_PREFIX = 'ct_firebase_state_rest_v3';
  const LOCATION_KEY_PREFIX = 'ct_firebase_location_v3';
  const primaryRoot = String(settings.rootPath || 'cashTopExchange/cashTopPOS').replace(/^\/+|\/+$/g, '');
  const legacyRoots = Array.isArray(settings.legacyRootPaths) ? settings.legacyRootPaths : [];
  const session = core.getSession() || {};
  const baseUrl = String(cfg.databaseURL || '').replace(/\/+$/, '');
  const rawStorage = {
    get: key => Storage.prototype.getItem.call(localStorage, key),
    set: (key, value) => Storage.prototype.setItem.call(localStorage, key, String(value)),
    remove: key => Storage.prototype.removeItem.call(localStorage, key)
  };

  function sanitizeSegment(value) {
    return String(value || '').trim().replace(/[.#$\[\]\/]/g, '_');
  }

  /*
   * كل شركة تملك مساراً وحيداً وثابتاً مبنياً على companyId. في الإصدارات
   * السابقة كان الفحص يجرب companyId وcompanyKey وlicenseId ثم يختار المسار
   * الأحدث؛ وهذا قد يربط مفتاحاً جديداً بمسار غير مقصود أو يقسم بيانات الشركة
   * بين أكثر من عقدة. نحتفظ بالأسماء القديمة للترحيل فقط، ولا نختارها إلا إذا
   * كانت بياناتها نفسها تثبت أنها تخص المفتاح الحالي.
   */
  const canonicalCompanyId = sanitizeSegment(
    session.tenantId || session.companyId || session.licenseId || session.companyKey || 'unassigned'
  ) || 'unassigned';
  const normalizedCompanyKey = String(session.companyKey || '').trim().toUpperCase();
  // لا نزامن أبداً إلى عقدة تحمل معرفاً مختلفاً عن tenantId الحالي.
  // الجذور القديمة مسموحة فقط إذا كان اسم عقدة الشركة نفسه هو tenantId الثابت.
  const legacyCompanyIds = [];
  const companyIds = [canonicalCompanyId];

  const stateKey = `${STATE_KEY_PREFIX}::${encodeURIComponent(canonicalCompanyId)}`;
  const locationKey = `${LOCATION_KEY_PREFIX}::${encodeURIComponent(canonicalCompanyId)}`;
  let syncing = false;
  let scheduledSync = null;
  let pollTimer = null;
  let selectedLocation = null;
  let authFallbackReason = '';

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(stateKey) || '{}') || {}; }
    catch (_) { return {}; }
  }

  function writeState(patch) {
    const next = { ...readState(), ...patch };
    try { sessionStorage.setItem(stateKey, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function errorMessage(error) {
    return String(error?.message || error?.code || error || 'تعذر الاتصال بـ Firebase.');
  }

  function readAuth() {
    try { return JSON.parse(rawStorage.get(AUTH_KEY) || 'null'); }
    catch (_) { return null; }
  }

  function saveAuth(auth) {
    rawStorage.set(AUTH_KEY, JSON.stringify(auth));
  }

  async function fetchWithTimeout(url, options = {}, timeout = 22000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('انتهت مهلة الاتصال مع Firebase.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function firebaseError(response) {
    const payload = await response.json().catch(() => null);
    const code = String(payload?.error?.message || payload?.error || '').trim();
    let message = `خطأ Firebase (${response.status})${code ? `: ${code}` : ''}`;
    if (response.status === 401 || response.status === 403 || code.includes('PERMISSION_DENIED')) {
      message = authFallbackReason
        ? 'قواعد Realtime Database رفضت الاتصال بدون مصادقة. فعّل Anonymous Authentication أو انشر قواعد المسار المرفقة.'
        : 'رفض Firebase الوصول. راجع قواعد Realtime Database وصلاحيات المسار.';
    } else if (code.includes('OPERATION_NOT_ALLOWED')) {
      message = 'تسجيل الدخول المجهول Anonymous غير مفعّل في مشروع Firebase.';
    } else if (code.includes('CONFIGURATION_NOT_FOUND')) {
      message = 'خدمة Firebase Authentication غير مهيأة في هذا المشروع.';
    }
    const error = new Error(message);
    error.firebaseCode = code;
    error.httpStatus = response.status;
    return error;
  }

  function isAuthConfigurationError(error) {
    const code = String(error?.firebaseCode || error?.message || '');
    return code.includes('CONFIGURATION_NOT_FOUND') ||
      code.includes('OPERATION_NOT_ALLOWED') ||
      code.includes('INVALID_PROVIDER_ID') ||
      code.includes('API_KEY_SERVICE_BLOCKED');
  }


  function isPermissionError(error) {
    const code = String(error?.firebaseCode || error?.message || '');
    const status = Number(error?.httpStatus || 0);
    return status === 401 || status === 403 || code.includes('PERMISSION_DENIED');
  }

  async function refreshToken(refreshTokenValue) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue
    });
    const response = await fetchWithTimeout(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
      }
    );
    if (!response.ok) throw await firebaseError(response);
    const data = await response.json();
    const auth = {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      uid: data.user_id,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000
    };
    saveAuth(auth);
    return auth.idToken;
  }

  async function createAnonymousToken() {
    const response = await fetchWithTimeout(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({ returnSecureToken: true })
      }
    );
    if (!response.ok) throw await firebaseError(response);
    const data = await response.json();
    const auth = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      uid: data.localId,
      expiresAt: Date.now() + Math.max(60, Number(data.expiresIn || 3600) - 120) * 1000
    };
    saveAuth(auth);
    return auth.idToken;
  }

  // المشروع المرفق كان يتابع إلى RTDB حتى عندما لا تتوفر Anonymous Auth.
  // هذا يمنع خطأ CONFIGURATION_NOT_FOUND من إيقاف المزامنة بالكامل، ويترك
  // قواعد قاعدة البيانات الفعلية تقرر إن كان الوصول بدون token مسموحاً.
  async function getIdToken() {
    const auth = readAuth();
    if (auth?.idToken && Number(auth.expiresAt || 0) > Date.now()) return auth.idToken;
    if (auth?.refreshToken) {
      try {
        return await refreshToken(auth.refreshToken);
      } catch (error) {
        rawStorage.remove(AUTH_KEY);
        if (!isAuthConfigurationError(error)) console.warn('[CASH TOP 2] Firebase token refresh:', error);
      }
    }
    try {
      return await createAnonymousToken();
    } catch (error) {
      if (isAuthConfigurationError(error)) {
        authFallbackReason = String(error.firebaseCode || error.message || 'AUTH_UNAVAILABLE');
        writeState({ authMode: 'database-rules', authFallbackReason, authCheckedAt: Date.now() });
        console.warn('[CASH TOP 2] Firebase Authentication unavailable; continuing with RTDB rules only.');
        return '';
      }
      throw error;
    }
  }


  async function requireDatabaseToken() {
    const token = await getIdToken();
    if (token) return token;
    throw new Error('قاعدة Firebase تطلب تسجيل دخول، لكن خدمة Authentication غير مهيأة. انشر قواعد التوافق المرفقة أو فعّل Anonymous Authentication.');
  }

  function exactLocation() {
    return { root: primaryRoot, companyId: canonicalCompanyId };
  }

  function legacyCandidateLocations() {
    const roots = [...new Set([
      primaryRoot,
      ...legacyRoots.map(root => String(root || '').replace(/^\/+|\/+$/g, ''))
    ].filter(Boolean))];
    const locations = [];
    roots.forEach(root => {
      if (root !== primaryRoot) locations.push({ root, companyId: canonicalCompanyId });
      legacyCompanyIds.forEach(companyId => locations.push({ root, companyId }));
    });
    return locations.filter((location, index, all) =>
      all.findIndex(item => item.root === location.root && item.companyId === location.companyId) === index
    );
  }

  function locationPath(location) {
    return `${location.root}/${location.companyId}`;
  }

  function databaseEndpoint(location, token = '') {
    const query = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseUrl}/${locationPath(location)}.json${query}`;
  }

  async function readLocation(location, token) {
    const response = await fetchWithTimeout(databaseEndpoint(location, token), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Firebase-ETag': 'true',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) throw await firebaseError(response);
    return {
      data: (await response.json()) || {},
      etag: response.headers.get('ETag') || '*'
    };
  }

  async function writeLocation(location, token, data, etag = '*') {
    const response = await fetchWithTimeout(databaseEndpoint(location, token), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'If-Match': etag,
        'Cache-Control': 'no-cache, no-store, max-age=0'
      },
      body: JSON.stringify(data)
    });
    if (response.status === 412) return { conflict: true };
    if (!response.ok) throw await firebaseError(response);
    return { ok: true, data: await response.json().catch(() => data) };
  }

  function remoteStats(data) {
    const datasets = data?.datasets && typeof data.datasets === 'object' ? data.datasets : {};
    const times = Object.values(datasets).map(item => Number(item?.updatedAt || 0));
    const updatedAt = Math.max(Number(data?.meta?.updatedAt || 0), ...times, 0);
    const count = Object.keys(datasets).length;
    return { count, updatedAt, hasData: count > 0 || Boolean(data?.meta) };
  }

  function remoteIdentity(data) {
    const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
    const rawAccess = data?.datasets?.cashtop_company_access;
    let access = {};
    try {
      const payload = normalizeRemotePayload(rawAccess);
      const decoded = payload?.valueEncoding === VALUE_ENCODING && typeof payload.value === 'string'
        ? JSON.parse(payload.value)
        : payload?.value;
      if (decoded && typeof decoded === 'object') access = decoded;
    } catch (_) {}
    return {
      tenantId: sanitizeSegment(access.tenantId || access.companyId || meta.tenantId || meta.companyId || ''),
      companyId: sanitizeSegment(access.tenantId || access.companyId || meta.tenantId || meta.companyId || ''),
      companyKey: String(access.companyKey || meta.companyKey || '').trim().toUpperCase()
    };
  }

  function locationBelongsToCurrentCompany(location, data) {
    const stats = remoteStats(data);
    if (!stats.hasData) return location.root === primaryRoot && location.companyId === canonicalCompanyId;
    const identity = remoteIdentity(data);
    // أي عقدة تحتوي بيانات يجب أن تعلن نفس tenantId الثابت. لا نعتمد على المفتاح
    // وحده لأن المفتاح يمكن تغييره أو إعادة استخدامه لاحقاً لشركة أخرى.
    if (!identity.tenantId || identity.tenantId !== canonicalCompanyId) return false;
    if (normalizedCompanyKey && identity.companyKey && identity.companyKey !== normalizedCompanyKey) return false;
    return true;
  }

  function loadCachedLocation() {
    try {
      const cached = JSON.parse(rawStorage.get(locationKey) || 'null');
      if (cached?.root && cached?.companyId) return { root: cached.root, companyId: cached.companyId };
    } catch (_) {}
    return null;
  }

  function saveSelectedLocation(location) {
    selectedLocation = location;
    rawStorage.set(locationKey, JSON.stringify({ ...location, selectedAt: Date.now() }));
    writeState({ remotePath: locationPath(location), canonicalCompanyId });
  }

  async function resolveLocation(token, forceProbe = false) {
    const isExact = location => location?.root === primaryRoot && location?.companyId === canonicalCompanyId;
    if (selectedLocation && !forceProbe && isExact(selectedLocation)) {
      const read = await readLocation(selectedLocation, token);
      if (locationBelongsToCurrentCompany(selectedLocation, read.data)) {
        return { location: selectedLocation, read };
      }
      selectedLocation = null;
    }

    let permissionError = null;
    const cached = loadCachedLocation();
    if (cached && !forceProbe && isExact(cached)) {
      try {
        const read = await readLocation(cached, token);
        if (locationBelongsToCurrentCompany(cached, read.data)) {
          saveSelectedLocation(cached);
          return { location: cached, read };
        }
        rawStorage.remove(locationKey);
      } catch (error) {
        if (isPermissionError(error)) permissionError = error;
        else console.warn('[CASH TOP 2] Firebase cached path:', locationPath(cached), error);
      }
    }

    /* المسار الرسمي للشركة هو الخيار الأول دائماً حتى لو كان هناك مسار تاريخي محفوظ. */
    const exact = exactLocation();
    let exactRead = null;
    try {
      exactRead = await readLocation(exact, token);
      if (remoteStats(exactRead.data).hasData) {
        if (!locationBelongsToCurrentCompany(exact, exactRead.data)) {
          throw new Error('تعارض هوية مسار Firebase: المسار الحالي يحتوي بيانات شركة أخرى. تم إيقاف المزامنة لحماية البيانات.');
        }
        saveSelectedLocation(exact);
        return { location: exact, read: exactRead };
      }
    } catch (error) {
      if (isPermissionError(error)) permissionError = error;
      else throw error;
    }

    /*
     * ترحيل اختياري من المسارات التاريخية: لا نستخدم أي عقدة إلا عندما يثبت
     * companyId أو companyKey داخلها أنها تخص الجلسة الحالية.
     */
    let legacyMatch = null;
    const legacyLocations = legacyCandidateLocations();
    if (cached && !isExact(cached)) legacyLocations.unshift(cached);
    if (selectedLocation && !isExact(selectedLocation)) legacyLocations.unshift(selectedLocation);
    for (const location of legacyLocations.filter((item, index, all) =>
      all.findIndex(other => other.root === item.root && other.companyId === item.companyId) === index
    )) {
      try {
        const read = await readLocation(location, token);
        const stats = remoteStats(read.data);
        if (!stats.hasData || !locationBelongsToCurrentCompany(location, read.data)) continue;
        if (!legacyMatch || stats.updatedAt > legacyMatch.stats.updatedAt) {
          legacyMatch = { location, read, stats };
        }
      } catch (error) {
        if (isPermissionError(error)) permissionError ||= error;
        else console.warn('[CASH TOP 2] Firebase legacy path probe:', locationPath(location), error);
      }
    }

    if (legacyMatch) {
      saveSelectedLocation(legacyMatch.location);
      return { location: legacyMatch.location, read: legacyMatch.read };
    }
    if (!exactRead && permissionError) throw permissionError;

    saveSelectedLocation(exact);
    return { location: exact, read: exactRead || { data: {}, etag: '*' } };
  }

  // نجرب Realtime Database مباشرة أولاً. بذلك لا يتم استدعاء خدمة
  // Authentication غير المهيأة ولا يظهر CONFIGURATION_NOT_FOUND. لا نحاول
  // Anonymous Auth إلا إذا كانت قواعد قاعدة البيانات نفسها ترفض الوصول.
  async function openDatabaseAccess(forceProbe = false) {
    try {
      return {
        token: '',
        authMode: 'database-rules',
        resolved: await resolveLocation('', forceProbe)
      };
    } catch (error) {
      if (!isPermissionError(error)) throw error;
      const token = await requireDatabaseToken();
      selectedLocation = null;
      return {
        token,
        authMode: 'anonymous',
        resolved: await resolveLocation(token, forceProbe)
      };
    }
  }

  function localMetaFor(key) {
    return core.safeJson(core.rawGet(core.metaKey(key)), {}) || {};
  }

  /*
   * Firebase Realtime Database يمنع أي مفتاح متداخل يحتوي . # $ [ ] /.
   * صلاحيات الموظفين تستخدم مفاتيح دقيقة مثل sales.create ولذلك كان رفع
   * كائن الموظف مباشرة يفشل برسالة Invalid data. نحفظ قيمة كل dataset كنص
   * JSON واحد داخل Firebase ثم نعيدها كما هي إلى localStorage. هذا يحافظ على
   * جميع المفاتيح الأصلية ويمنع الخطأ لأي بيانات مستقبلية أيضاً.
   */
  const VALUE_ENCODING = 'local-storage-json-v1';

  function normalizeRemotePayload(payload) {
    if (payload && typeof payload === 'object' && (
      Object.prototype.hasOwnProperty.call(payload, 'value') ||
      Object.prototype.hasOwnProperty.call(payload, 'updatedAt') ||
      Object.prototype.hasOwnProperty.call(payload, 'revision') ||
      payload.deleted === true
    )) {
      const encoded = payload.valueEncoding === VALUE_ENCODING;
      return {
        value: payload.deleted === true ? null : payload.value,
        valueEncoding: encoded ? VALUE_ENCODING : '',
        deleted: payload.deleted === true,
        updatedAt: Number(payload.updatedAt || 0),
        revision: Math.max(1, Number(payload.revision || 1)),
        deviceId: payload.deviceId || null,
        page: payload.page || ''
      };
    }
    return {
      value: payload,
      valueEncoding: '',
      deleted: payload == null,
      updatedAt: 0,
      revision: 1,
      deviceId: null,
      page: ''
    };
  }

  function makeLocalPayload(key, remoteRevision = 0) {
    const raw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    const meta = localMetaFor(key);
    return {
      value: raw == null ? null : String(raw),
      valueEncoding: VALUE_ENCODING,
      deleted: raw == null,
      updatedAt: Math.max(1, Number(meta.updatedAt || 0), Date.now()),
      revision: Math.max(1, Number(meta.revision || 0), Number(remoteRevision || 0) + 1),
      deviceId: core.rawGet('cashtop_device_id') || '',
      page: core.FILE || ''
    };
  }

  function decodeDatasetObject(payload) {
    try {
      const normalized = normalizeRemotePayload(payload);
      if (normalized.deleted) return {};
      let value = normalized.value;
      if (normalized.valueEncoding === VALUE_ENCODING && typeof value === 'string') value = JSON.parse(value);
      else if (typeof value === 'string') value = JSON.parse(value);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function mergeAdminControlledAccess(remotePayload) {
    const key = 'cashtop_company_access';
    const remoteAccess = decodeDatasetObject(remotePayload);
    if (!Object.keys(remoteAccess).length) return false;
    const localRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    let localAccess = {};
    try { localAccess = JSON.parse(localRaw || '{}') || {}; } catch (_) { localAccess = {}; }
    const protectedFields = [
      'companyId', 'companyKey', 'companyName', 'status', 'plan', 'startAt', 'endAt',
      'durationUnit', 'durationQuantity', 'backupImportEnabled', 'authVersion', 'deleted'
    ];
    const merged = { ...localAccess };
    protectedFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(remoteAccess, field)) merged[field] = remoteAccess[field];
    });
    /* حالة المدير من لوحة الإدارة تبقى مرجعية، بينما نحتفظ بكلمة مرور أحدث غُيرت من إعدادات الشركة. */
    if (remoteAccess.manager && typeof remoteAccess.manager === 'object') {
      merged.manager = { ...(remoteAccess.manager || {}), ...(localAccess.manager || {}) };
      ['id', 'username', 'displayName', 'role', 'active', 'authVersion'].forEach(field => {
        if (Object.prototype.hasOwnProperty.call(remoteAccess.manager, field)) merged.manager[field] = remoteAccess.manager[field];
      });
    }
    const mergedRaw = JSON.stringify(merged);
    if (mergedRaw === String(localRaw || '')) return false;
    core.rawSet(core.namespaceKey(key), mergedRaw);
    return true;
  }

  function pendingForKey(key) {
    return core.getSyncQueue().find(item => item.key === key) || null;
  }

  function completePendingForKey(key) {
    core.getSyncQueue()
      .filter(item => item.key === key)
      .forEach(item => core.completeSyncOperation(item.id));
  }

  /*
   * لا نعتبر الرفع ناجحاً محلياً إذا تغيّرت نفس المجموعة أثناء انتظار
   * استجابة الشبكة. في هذه الحالة تكون Firebase قد استلمت النسخة التي بدأنا
   * بها فقط، بينما تبقى العملية الأحدث في الطابور للدفعة التالية. هذا يمنع
   * ضياع فرع/موظف/فاتورة أُضيفت أثناء مزامنة جارية.
   */
  function markUploaded(key, payload) {
    const currentRaw = core.getRawCompanyDataset ? core.getRawCompanyDataset(key) : localStorage.getItem(key);
    const expectedRaw = payload.deleted ? null : payload.value;
    const currentMeta = localMetaFor(key);
    if (currentRaw !== expectedRaw || Number(currentMeta.updatedAt || 0) > Number(payload.updatedAt || 0)) {
      return false;
    }
    core.rawSet(core.metaKey(key), JSON.stringify({
      ...currentMeta,
      updatedAt: Number(payload.updatedAt || Date.now()),
      revision: Number(payload.revision || 1),
      deviceId: payload.deviceId || '',
      source: 'firebase-rtdb-rest',
      seeded: false
    }));
    completePendingForKey(key);
    return true;
  }

  function canApplyRemote(key, payload, allowEqual = true) {
    if (pendingForKey(key)) return false;
    const localMeta = localMetaFor(key);
    const localTime = Number(localMeta.updatedAt || 0);
    if (localMeta.seeded === true || localTime <= 0) return true;
    const remoteTime = Number(payload.updatedAt || 0);
    return allowEqual ? remoteTime >= localTime : remoteTime > localTime;
  }

  function applyRemote(key, payload, options = {}) {
    if (options.force !== true && !canApplyRemote(key, payload, options.allowEqual !== false)) return false;
    // حتى مع force لا نكتب فوق تعديل محلي ما زال ينتظر الرفع.
    if (pendingForKey(key)) return false;
    core.applyRemoteDataset(key, payload.deleted ? null : payload.value, {
      updatedAt: Number(payload.updatedAt || Date.now()),
      revision: Number(payload.revision || 1),
      deviceId: payload.deviceId || null,
      source: 'firebase-rtdb-rest',
      seeded: false
    });
    completePendingForKey(key);
    return true;
  }

  function companyMeta(location, extra = {}) {
    return {
      tenantId: canonicalCompanyId,
      companyId: canonicalCompanyId,
      companyKey: session.companyKey || '',
      companyName: session.companyName || '',
      appName: 'كاش توب 2',
      schema: 19,
      datasetCount: core.DATA_KEYS.length,
      deviceId: core.rawGet('cashtop_device_id') || '',
      updatedAt: Date.now(),
      ...extra
    };
  }

  async function reconcileAll(options = {}) {
    if (!navigator.onLine) {
      return { processed: 0, pulled: 0, uploaded: 0, remaining: core.getSyncQueue().length, offline: true };
    }
    if (syncing) return { processed: 0, pulled: 0, uploaded: 0, remaining: core.getSyncQueue().length, busy: true };

    syncing = true;
    writeState({ syncing: true, lastError: '', syncStartedAt: Date.now() });
    try {
      const forceProbe = options.forcePathProbe === true || options.forceCheck === true;
      let access = await openDatabaseAccess(forceProbe);
      let token = access.token;
      let resolved = access.resolved;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt > 0) resolved = { location: resolved.location, read: await readLocation(resolved.location, token) };
        const remoteRead = resolved.read;
        const remoteCompany = remoteRead.data && typeof remoteRead.data === 'object' ? remoteRead.data : {};
        if (remoteStats(remoteCompany).hasData && !locationBelongsToCurrentCompany(resolved.location, remoteCompany)) {
          throw new Error('تم منع مزامنة عقدة لا تخص المفتاح الحالي. لا توجد أي بيانات مشتركة بين الشركات.');
        }
        const remoteDatasets = remoteCompany.datasets && typeof remoteCompany.datasets === 'object'
          ? remoteCompany.datasets
          : {};

        const nextDatasets = { ...remoteDatasets };
        const pulls = [];
        const uploads = [];
        const queue = core.getSyncQueue();

        for (const key of core.DATA_KEYS) {
          const hasRemote = Object.prototype.hasOwnProperty.call(remoteDatasets, key);
          const remote = hasRemote ? normalizeRemotePayload(remoteDatasets[key]) : null;
          const localMeta = localMetaFor(key);
          const localTime = Number(localMeta.updatedAt || 0);
          const remoteTime = Number(remote?.updatedAt || 0);
          const pending = queue.some(item => item.key === key);
          const seeded = localMeta.seeded === true || localTime <= 0;

          /* فتح/قفل استيراد النسخ وخطة الشركة لا يوقفان المزامنة ولا تضيع قيمهما عند وجود تعديل محلي معلّق. */
          if (key === 'cashtop_company_access' && remote && pending) {
            mergeAdminControlledAccess(remoteDatasets[key]);
          }

          if (remote && (seeded || (!pending && remoteTime > localTime))) {
            pulls.push({ key, payload: remote });
            continue;
          }

          /* لا نرفع عشرات المجموعات الفارغة المزروعة تلقائياً عند إنشاء مفتاح جديد. */
          if (!remote && seeded && !pending) continue;

          if (!remote || pending || localTime > remoteTime) {
            const payload = makeLocalPayload(key, remote?.revision || 0);
            uploads.push({ key, payload });
            nextDatasets[key] = payload;
          }
        }

        if (uploads.length === 0) {
          const appliedPulls = pulls.reduce((count, item) => count + (applyRemote(item.key, item.payload) ? 1 : 0), 0);
          writeState({
            syncing: false,
            initialLoaded: true,
            lastRemoteUpdatedAt: Number(remoteCompany.meta?.updatedAt || 0),
            loadedAt: Date.now(),
            lastSuccessAt: Date.now(),
            lastError: '',
            authMode: token ? 'anonymous' : 'database-rules',
            remotePath: locationPath(resolved.location)
          });
          core.updateSyncBadge();
          return {
            processed: 0,
            pulled: appliedPulls,
            uploaded: 0,
            remaining: core.getSyncQueue().length,
            projectId: cfg.projectId,
            path: locationPath(resolved.location),
            authMode: token ? 'anonymous' : 'database-rules'
          };
        }

        const nextCompany = {
          ...remoteCompany,
          datasets: nextDatasets,
          meta: {
            ...(remoteCompany.meta || {}),
            ...companyMeta(resolved.location, {
              reconciledAt: Date.now(),
              lastSyncedBy: core.rawGet('cashtop_device_id') || ''
            })
          }
        };

        let written;
        try {
          written = await writeLocation(resolved.location, token, nextCompany, remoteRead.etag);
        } catch (error) {
          if (!token && isPermissionError(error)) {
            token = await requireDatabaseToken();
            selectedLocation = resolved.location;
            resolved = { location: resolved.location, read: await readLocation(resolved.location, token) };
            continue;
          }
          throw error;
        }
        if (written.conflict) continue;

        const appliedPulls = pulls.reduce((count, item) => count + (applyRemote(item.key, item.payload) ? 1 : 0), 0);
        const completedUploads = uploads.reduce((count, item) => count + (markUploaded(item.key, item.payload) ? 1 : 0), 0);

        writeState({
          syncing: false,
          initialLoaded: true,
          lastRemoteUpdatedAt: Number(nextCompany.meta.updatedAt || Date.now()),
          loadedAt: Date.now(),
          lastSuccessAt: Date.now(),
          lastError: '',
          authMode: token ? 'anonymous' : 'database-rules',
          remotePath: locationPath(resolved.location)
        });
        core.updateSyncBadge();
        window.dispatchEvent(new CustomEvent('cashtop:sync-complete', {
          detail: { processed: completedUploads, pulled: appliedPulls, uploaded: completedUploads }
        }));
        return {
          processed: completedUploads,
          pulled: appliedPulls,
          uploaded: completedUploads,
          remaining: core.getSyncQueue().length,
          projectId: cfg.projectId,
          path: locationPath(resolved.location),
          authMode: token ? 'anonymous' : 'database-rules'
        };
      }

      throw new Error('حدث تعارض متكرر أثناء المزامنة. أعد المحاولة بعد لحظات.');
    } catch (error) {
      const message = errorMessage(error);
      writeState({ syncing: false, lastError: message, errorAt: Date.now() });
      console.error('[CASH TOP 2] Firebase REST sync:', error);
      throw new Error(message);
    } finally {
      syncing = false;
      core.updateSyncBadge();
    }
  }

  async function pullAll(options = {}) {
    if (!navigator.onLine) return { hasRemote: false, count: 0, applied: 0, offline: true };
    const forceProbe = options.forcePathProbe === true || options.forceCheck === true;
    const access = await openDatabaseAccess(forceProbe);
    const token = access.token;
    const resolved = access.resolved;
    const datasets = resolved.read.data?.datasets || {};
    let applied = 0;

    for (const [key, rawPayload] of Object.entries(datasets)) {
      if (!core.DATA_KEYS.includes(key)) continue;
      const payload = normalizeRemotePayload(rawPayload);
      const localMeta = localMetaFor(key);
      const localTime = Number(localMeta.updatedAt || 0);
      const pending = core.getSyncQueue().some(item => item.key === key);
      const seeded = localMeta.seeded === true || localTime <= 0;
      if ((options.force === true || seeded || (!pending && Number(payload.updatedAt || 0) > localTime)) &&
          applyRemote(key, payload, { force: options.force === true })) {
        applied += 1;
      }
    }

    writeState({
      initialLoaded: true,
      loadedAt: Date.now(),
      lastRemoteUpdatedAt: Number(resolved.read.data?.meta?.updatedAt || 0),
      lastSuccessAt: Date.now(),
      lastError: '',
      authMode: token ? 'anonymous' : 'database-rules',
      remotePath: locationPath(resolved.location)
    });
    core.updateSyncBadge();
    return {
      hasRemote: Object.keys(datasets).length > 0,
      count: Object.keys(datasets).length,
      applied,
      path: locationPath(resolved.location)
    };
  }

  async function syncAll(options = {}) {
    return reconcileAll(options);
  }

  async function flushPendingQueue() {
    const result = await reconcileAll();
    return { processed: result.uploaded || 0, remaining: result.remaining || 0, pulled: result.pulled || 0 };
  }

  async function checkRemoteAndPull(force = false) {
    return pullAll({ force: Boolean(force), forcePathProbe: Boolean(force) });
  }

  async function uploadDataset(key) {
    if (!core.DATA_KEYS.includes(key)) return false;
    core.enqueueSyncOperation(key);
    const result = await reconcileAll();
    return Number(result.uploaded || 0) > 0;
  }

  function scheduleSync(delay = 900) {
    clearTimeout(scheduledSync);
    scheduledSync = setTimeout(() => {
      if (!navigator.onLine) return;
      reconcileAll().catch(error => console.warn('[CASH TOP 2] scheduled Firebase sync:', error));
    }, delay);
  }

  function signOut() {
    rawStorage.remove(AUTH_KEY);
    writeState({ signedOutAt: Date.now() });
    return Promise.resolve();
  }

  window.CashtopFirebase = {
    syncAll,
    reconcileAll,
    flushPendingQueue,
    uploadDataset,
    pullAll,
    checkRemoteAndPull,
    signOut,
    getState: readState,
    resetRemotePath: () => {
      rawStorage.remove(locationKey);
      selectedLocation = null;
      return Promise.resolve(true);
    },
    getProjectInfo: () => ({
      projectId: cfg.projectId,
      databaseURL: cfg.databaseURL,
      path: selectedLocation ? locationPath(selectedLocation) : `${primaryRoot}/${companyIds[0]}`,
      companyIds: [...companyIds],
      authMode: readState().authMode || 'auto'
    })
  };

  window.addEventListener('cashtop:data-changed', () => scheduleSync(700));
  window.addEventListener('online', () => scheduleSync(250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) scheduleSync(400);
  });

  pollTimer = setInterval(() => {
    if (navigator.onLine && !document.hidden) reconcileAll().catch(() => null);
  }, 4000);

  window.addEventListener('pagehide', () => {
    clearTimeout(scheduledSync);
    if (pollTimer) clearInterval(pollTimer);
  }, { once: true });

  if (navigator.onLine) scheduleSync(350);
} else if (core) {
  console.warn('[CASH TOP 2] Firebase sync configuration is incomplete.');
  core.updateSyncBadge();
}

(function () {
  'use strict';

  const rawGet = key => Storage.prototype.getItem.call(localStorage, key);
  const rawSet = (key, value) => Storage.prototype.setItem.call(localStorage, key, String(value));
  const rawRemove = key => Storage.prototype.removeItem.call(localStorage, key);
  const rawKey = index => Storage.prototype.key.call(localStorage, index);
  const parse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch (_) { return fallback; } };

  function decodeJsonValue(value, fallback = null) {
    let parsed = value;
    for (let i = 0; i < 2 && typeof parsed === 'string'; i += 1) {
      const decoded = parse(parsed, null);
      if (decoded === null) break;
      parsed = decoded;
    }
    return parsed == null ? fallback : parsed;
  }

  function normalizeArray(value) {
    const parsed = decodeJsonValue(value, []);
    if (Array.isArray(parsed)) return parsed.filter(item => item != null);
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([key, item]) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && item.id == null && !/^\d+$/.test(key)) return { ...item, id: key };
        return item;
      }).filter(item => item != null);
    }
    return [];
  }

  function cleanupLegacyDemo() {
    const licenses = normalizeArray(rawGet('cashtop_admin_licenses')).filter(item => normalizeKey(item.key) !== 'CASHTOP-DEMO');
    const users = normalizeArray(rawGet('cashtop_admin_users')).filter(item => normalizeKey(item.companyKey) !== 'CASHTOP-DEMO');
    rawSet('cashtop_admin_licenses', JSON.stringify(licenses)); rawSet('cashtop_admin_users', JSON.stringify(users));
    if (normalizeKey(rawGet('cashtop_remembered_key')) === 'CASHTOP-DEMO') { rawRemove('cashtop_remembered_key'); rawRemove('cashtop_remembered_user'); }
  }

  function normalizeKey(value) { return String(value || '').trim().toUpperCase(); }
  function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }
  function sanitizeSegment(value) { return String(value || '').trim().replace(/[.#$\[\]\/]/g, '_'); }
  function namespaceKey(companyId, key) { return `cashtop_data::${encodeURIComponent(companyId)}::${key}`; }
  function metaKey(companyId, key) { return `cashtop_meta::${encodeURIComponent(companyId)}::${key}`; }

  function datasetValue(companyNode, key, fallback) {
    const payload = companyNode?.datasets?.[key];
    if (payload && typeof payload === 'object' && (
      Object.prototype.hasOwnProperty.call(payload, 'value') ||
      Object.prototype.hasOwnProperty.call(payload, 'deleted') ||
      Object.prototype.hasOwnProperty.call(payload, 'updatedAt')
    )) {
      if (payload.deleted === true) return fallback;
      const rawValue = payload.value ?? fallback;
      return payload.valueEncoding === 'local-storage-json-v1' ? decodeJsonValue(rawValue, fallback) : decodeJsonValue(rawValue, rawValue);
    }
    return decodeJsonValue(payload, fallback);
  }

  function usernameToEmail(companyKey, username) {
    const clean = value => String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    if (String(username).includes('@')) return String(username).trim().toLowerCase();
    return `${clean(companyKey)}.${clean(username)}@login.cashtop.app`;
  }

  function showStatus(message, type = 'info') {
    let box = document.getElementById('loginStatus');
    if (!box) {
      box = document.createElement('div');
      box.id = 'loginStatus';
      box.style.cssText = 'margin:0 0 14px;padding:9px 11px;border-radius:4px;font-size:12px;font-weight:700;line-height:1.7;display:none;';
      document.getElementById('loginForm')?.prepend(box);
    }
    const styles = {
      error: ['#fff0ef', '#b52b1f', '#f2b9b4'], success: ['#eaf8f0', '#087a43', '#a9dfc4'],
      info: ['#eef5fb', '#23668d', '#b8d7ea'], warning: ['#fff7e6', '#9b5b00', '#f2d295']
    }[type] || ['#eef5fb', '#23668d', '#b8d7ea'];
    box.style.background = styles[0]; box.style.color = styles[1]; box.style.border = `1px solid ${styles[2]}`;
    box.textContent = message; box.style.display = 'block';
  }

  function validateLicense(license) {
    if (!license) return { ok: false, message: 'مفتاح الشركة غير موجود أو لم تتم مزامنته بعد.' };
    if (license.status && license.status !== 'active') return { ok: false, message: 'تم إيقاف مفتاح الشركة. راجع مسؤول النظام.' };
    const start = license.startAt ? new Date(license.startAt).getTime() : 0;
    const end = license.endAt ? new Date(license.endAt).getTime() : 0;
    if (start && Number.isFinite(start) && Date.now() < start) return { ok: false, message: 'مدة المفتاح لم تبدأ بعد.' };
    if (end && Number.isFinite(end) && Date.now() >= end) return { ok: false, message: 'انتهت مدة مفتاح الشركة.' };
    return { ok: true, end };
  }

  function saveRemembered(key, username, remember) {
    if (remember) {
      rawSet('cashtop_remembered_key', key);
      rawSet('cashtop_remembered_user', username);
    } else {
      rawRemove('cashtop_remembered_key'); rawRemove('cashtop_remembered_user');
    }
  }

  function findCompanyAccessByKey(companyKey) {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = rawKey(i);
      if (!key || !key.endsWith('::cashtop_company_access')) continue;
      const access = decodeJsonValue(rawGet(key), null);
      if (access && normalizeKey(access.companyKey) === companyKey) return access;
    }
    return null;
  }

  function resolveLocalContext(companyKey) {
    const licenses = normalizeArray(rawGet('cashtop_admin_licenses'));
    const users = normalizeArray(rawGet('cashtop_admin_users'));
    let license = licenses.find(item => normalizeKey(item.key) === companyKey) || null;
    const accessFromScan = findCompanyAccessByKey(companyKey);
    if (!license && accessFromScan) {
      license = {
        id: accessFromScan.licenseId || accessFromScan.companyId || companyKey,
        key: companyKey,
        companyId: accessFromScan.companyId || sanitizeSegment(companyKey),
        companyName: accessFromScan.companyName || 'الشركة',
        status: accessFromScan.status || 'active',
        plan: accessFromScan.plan || 'pro',
        backupImportEnabled: accessFromScan.backupImportEnabled === true,
        startAt: accessFromScan.startAt || '',
        endAt: accessFromScan.endAt || ''
      };
      licenses.push(license);
      rawSet('cashtop_admin_licenses', JSON.stringify(licenses));
    }
    if (!license) return { license: null, users, access: accessFromScan, branches: [], employees: [] };
    const companyId = license.companyId || license.id;
    const access = decodeJsonValue(rawGet(namespaceKey(companyId, 'cashtop_company_access')), accessFromScan || {});
    const branches = normalizeArray(rawGet(namespaceKey(companyId, 'cashtop_branches')));
    const employees = normalizeArray(rawGet(namespaceKey(companyId, 'cashtop_employees')));
    return { license, users, access, branches, employees, companyId };
  }

  function authenticateContext(context, companyKey, username, password) {
    context = {
      ...(context || {}),
      users: normalizeArray(context?.users),
      branches: normalizeArray(context?.branches),
      employees: normalizeArray(context?.employees)
    };
    const checked = validateLicense(context.license || context.access);
    if (!checked.ok) throw new Error(checked.message);
    const uname = normalizeUsername(username);
    let account = null;

    const legacy = context.users.find(item => normalizeKey(item.companyKey) === companyKey && normalizeUsername(item.username) === uname);
    if (legacy) account = { ...legacy, role: legacy.role || 'admin' };

    const manager = context.access?.manager;
    if (!account && manager && normalizeUsername(manager.username) === uname) {
      account = {
        id: manager.id || `ADMIN_${uname}`,
        username: manager.username,
        password: manager.password,
        displayName: manager.displayName || manager.name || manager.username,
        role: 'admin', active: manager.active !== false,
        permissions: manager.permissions || {}
      };
    }

    if (!account) {
      const branch = context.branches.find(item => normalizeUsername(item.managerUsername) === uname);
      if (branch) {
        account = {
          id: branch.managerUserId || `BRM_${branch.id}`,
          username: branch.managerUsername,
          password: branch.managerPassword,
          displayName: branch.manager || branch.managerUsername,
          role: 'branch-admin', active: branch.managerActive !== false && branch.status !== 'مجمد',
          permissions: branch.managerPermissions || {}, branchRecordId: branch.id, branchId: branch.isMain === true ? 'MAIN' : branch.id, dataBranchId: branch.isMain === true ? 'MAIN' : branch.id, branchName: branch.name
        };
      }
    }

    if (!account) {
      const employee = context.employees.find(item => normalizeUsername(item.username) === uname);
      if (employee) {
        account = {
          id: employee.id, username: employee.username, password: employee.password,
          displayName: employee.name || employee.username, role: 'employee',
          active: employee.status === 'active', permissions: employee.permissions || {}, branchRecordId: employee.branchId || null, branchId: (context.branches.find(branch => String(branch.id) === String(employee.branchId))?.isMain === true ? 'MAIN' : employee.branchId) || 'MAIN', dataBranchId: (context.branches.find(branch => String(branch.id) === String(employee.branchId))?.isMain === true ? 'MAIN' : employee.branchId) || 'MAIN',
          branchName: employee.branchName || context.branches.find(branch => String(branch.id) === String(employee.branchId))?.name || ''
        };
      }
    }

    if (!account || String(account.password ?? '') !== String(password)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    if (account.active === false) throw new Error('تم تعطيل حساب المستخدم أو الفرع.');
    return account;
  }

  function saveSession(context, account, companyKey, remember) {
    const license = context.license || context.access;
    const companyId = context.companyId || license.companyId || license.id || sanitizeSegment(companyKey);
    const session = {
      mode: 'local', uid: account.id, username: account.username, displayName: account.displayName || account.username,
      role: account.role || 'user', permissions: account.permissions || {}, branchRecordId: account.branchRecordId || null, branchId: account.branchId || (['admin','owner','company-admin'].includes(String(account.role||'').toLowerCase()) ? 'MAIN' : null), dataBranchId: account.dataBranchId || account.branchId || (['admin','owner','company-admin'].includes(String(account.role||'').toLowerCase()) ? 'MAIN' : null),
      branchName: account.branchName || '', companyKey, companyId,
      companyName: license.companyName || context.access?.companyName || 'الشركة',
      licenseId: license.id || license.licenseId || companyId, licenseStart: license.startAt || '', licenseEnd: license.endAt || '',
      plan: license.plan || context.access?.plan || 'pro', status: license.status || 'active', loginAt: new Date().toISOString(), lastLicenseCheck: Date.now()
    };
    rawSet('cashtop_session', JSON.stringify(session));
    saveRemembered(companyKey, account.username, remember);
    return session;
  }

  async function localLogin(key, username, password, remember) {
    const context = resolveLocalContext(key);
    if (!context.license && !context.access) throw new Error('مفتاح الشركة غير موجود محلياً.');
    const account = authenticateContext(context, key, username, password);
    saveSession(context, account, key, remember);
  }

  let loginDatabaseToken = '';
  async function getLoginDatabaseToken() {
    if (loginDatabaseToken) return loginDatabaseToken;
    const apiKey = window.CASHTOP_FIREBASE?.config?.apiKey;
    if (!apiKey) return '';
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ returnSecureToken: true }), cache: 'no-store'
    });
    if (!response.ok) return '';
    const data = await response.json().catch(() => ({}));
    loginDatabaseToken = data.idToken || '';
    return loginDatabaseToken;
  }
  function withAuth(url, token) {
    if (!token) return url;
    return `${url}${url.includes('?') ? '&' : '?'}auth=${encodeURIComponent(token)}`;
  }
  async function fetchJson(url, timeout = 18000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok && (response.status === 401 || response.status === 403)) {
        const token = await getLoginDatabaseToken().catch(() => '');
        if (token) response = await fetch(withAuth(url, token), { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      }
      if (!response.ok) throw new Error(`تعذر قراءة بيانات الدخول من Firebase (${response.status}).`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }


  function adminKeySegment(companyKey) { return sanitizeSegment(normalizeKey(companyKey)); }
  async function findRemoteCompanyViaAdminIndex(companyKey) {
    const settings = window.CASHTOP_FIREBASE || {}; const base = String(settings.config?.databaseURL || '').replace(/\/+$/,'');
    const adminRoot = String(settings.adminRootPath || 'cashTopExchange/cashTopAdmin').replace(/^\/+|\/+$/g,'');
    if (!base) return null;
    try {
      const entry = await fetchJson(`${base}/${adminRoot}/keyIndex/${adminKeySegment(companyKey)}.json`, 12000);
      const companyId = typeof entry === 'string' ? entry : entry?.companyId;
      if (!companyId) return null;
      const company = await fetchJson(`${base}/${settings.rootPath || 'cashTopExchange/cashTopPOS'}/${sanitizeSegment(companyId)}.json`, 18000);
      if (!company || typeof company !== 'object') return null;
      const access = datasetValue(company, 'cashtop_company_access', {}) || {};
      return { root: settings.rootPath || 'cashTopExchange/cashTopPOS', companyId: sanitizeSegment(companyId), node: company, access };
    } catch (error) { console.warn('[CASH TOP LOGIN] admin index lookup:', error); return null; }
  }

  async function findRemoteCompany(companyKey) {
    const indexed = await findRemoteCompanyViaAdminIndex(companyKey);
    if (indexed) return indexed;
    const settings = window.CASHTOP_FIREBASE || {};
    const cfg = settings.config || {};
    const base = String(cfg.databaseURL || '').replace(/\/+$/, '');
    if (!base) return null;
    const roots = [...new Set([settings.rootPath || 'cashTopExchange/cashTopPOS', ...(settings.legacyRootPaths || [])])]
      .map(root => String(root || '').replace(/^\/+|\/+$/g, '')).filter(Boolean);

    for (const root of roots) {
      let collection;
      try { collection = await fetchJson(`${base}/${root}.json`); }
      catch (error) { console.warn('[CASH TOP LOGIN] Firebase root:', root, error); continue; }
      if (!collection || typeof collection !== 'object') continue;
      for (const [companyId, node] of Object.entries(collection)) {
        if (!node || typeof node !== 'object') continue;
        const access = datasetValue(node, 'cashtop_company_access', {}) || {};
        const remoteKey = normalizeKey(access.companyKey || node.meta?.companyKey || '');
        if (remoteKey === companyKey || normalizeKey(companyId) === companyKey || sanitizeSegment(companyKey) === companyId) {
          return { root, companyId, node, access };
        }
      }
    }
    return null;
  }

  function hydrateRemoteCompany(remote, companyKey) {
    const companyId = String(remote.access?.companyId || remote.node?.meta?.companyId || remote.companyId || sanitizeSegment(companyKey));
    const datasets = remote.node?.datasets || {};
    Object.entries(datasets).forEach(([key, payload]) => {
      const value = datasetValue(remote.node, key, null);
      if (value === null) return;
      // New sync builds store the complete localStorage JSON as a string. Write
      // that string directly; JSON.stringify would double-encode it and turn
      // arrays such as branches/employees into strings on the next device.
      const storageValue = payload?.valueEncoding === 'local-storage-json-v1' && typeof payload?.value === 'string'
        ? payload.value
        : JSON.stringify(value);
      rawSet(namespaceKey(companyId, key), storageValue);
      rawSet(metaKey(companyId, key), JSON.stringify({
        updatedAt: Number(payload?.updatedAt || remote.node?.meta?.updatedAt || Date.now()),
        revision: Number(payload?.revision || 1), source: 'firebase-login-bootstrap', seeded: false
      }));
    });

    const access = remote.access || {};
    const licenses = normalizeArray(rawGet('cashtop_admin_licenses'));
    const license = {
      id: access.licenseId || companyId, key: companyKey, companyId,
      companyName: access.companyName || remote.node?.meta?.companyName || 'الشركة',
      status: access.status || 'active', plan: access.plan || 'pro', backupImportEnabled: access.backupImportEnabled === true, startAt: access.startAt || '', endAt: access.endAt || '', authVersion: access.authVersion || access.updatedAt || 0
    };
    const idx = licenses.findIndex(item => normalizeKey(item.key) === companyKey);
    if (idx >= 0) licenses[idx] = { ...licenses[idx], ...license }; else licenses.push(license);
    rawSet('cashtop_admin_licenses', JSON.stringify(licenses));

    if (access.manager?.username) {
      const users = normalizeArray(rawGet('cashtop_admin_users'));
      const user = {
        id: access.manager.id || `ADMIN_${companyId}`, companyKey, companyId,
        username: access.manager.username, password: access.manager.password,
        displayName: access.manager.displayName || access.manager.username,
        role: 'admin', active: access.manager.active !== false
      };
      const userIndex = users.findIndex(item => normalizeKey(item.companyKey) === companyKey && normalizeUsername(item.username) === normalizeUsername(user.username));
      if (userIndex >= 0) users[userIndex] = { ...users[userIndex], ...user }; else users.push(user);
      rawSet('cashtop_admin_users', JSON.stringify(users));
    }
    return companyId;
  }

  async function databaseLogin(key, username, password, remember) {
    const remote = await findRemoteCompany(key);
    if (!remote) throw new Error('لم يتم العثور على بيانات هذه الشركة في Firebase.');
    hydrateRemoteCompany(remote, key);
    await localLogin(key, username, password, remember);
  }

  async function firebaseLogin(key, username, password, remember) {
    const settings = window.CASHTOP_FIREBASE;
    const version = settings.sdkVersion || '12.15.0';
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
    ]);
    const firebaseConfig = settings.adminConfig || settings.config;
    const app = appModule.getApps().find(item => item.options?.projectId === firebaseConfig.projectId) || appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    await authModule.setPersistence(auth, remember ? authModule.browserLocalPersistence : authModule.browserSessionPersistence);
    const credential = await authModule.signInWithEmailAndPassword(auth, usernameToEmail(key, username), password);
    const db = firestoreModule.getFirestore(app);
    const usersCollection = settings.collections?.users || 'users';
    const licensesCollection = settings.collections?.licenses || 'licenses';
    const profileSnap = await firestoreModule.getDoc(firestoreModule.doc(db, usersCollection, credential.user.uid));
    if (!profileSnap.exists()) throw new Error('لا يوجد ملف صلاحيات مرتبط بهذا المستخدم.');
    const profile = profileSnap.data();
    if (profile.active === false) throw new Error('تم تعطيل حساب المستخدم.');
    if (normalizeKey(profile.licenseKey) !== key) throw new Error('المستخدم غير مرتبط بمفتاح الشركة المدخل.');
    const licenseSnap = await firestoreModule.getDoc(firestoreModule.doc(db, licensesCollection, key));
    const license = licenseSnap.exists() ? licenseSnap.data() : null;
    if (license?.endAt?.toDate) license.endAt = license.endAt.toDate().toISOString();
    if (license?.startAt?.toDate) license.startAt = license.startAt.toDate().toISOString();
    const checked = validateLicense(license);
    if (!checked.ok) { await authModule.signOut(auth); throw new Error(checked.message); }
    const session = {
      mode: 'firebase', uid: credential.user.uid, username: profile.username || username,
      displayName: profile.displayName || profile.username || username, role: profile.role || 'user',
      permissions: profile.permissions || {}, branchId: profile.branchId || null,
      companyKey: key, companyId: profile.companyId || license.companyId,
      companyName: profile.companyName || license.companyName, licenseId: license.id || key,
      licenseEnd: license.endAt, plan: license.plan || 'pro', backupImportEnabled: license.backupImportEnabled === true,
      status: license.status, loginAt: new Date().toISOString(), lastLicenseCheck: Date.now()
    };
    rawSet('cashtop_session', JSON.stringify(session)); saveRemembered(key, username, remember);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const key = normalizeKey(document.getElementById('companyKey').value);
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;
    const button = document.querySelector('.btn-login');
    if (!key || !username || !password) return showStatus('أكمل جميع بيانات الدخول.', 'warning');
    button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
    showStatus('جاري التحقق من الحساب والمفتاح...', 'info');
    try {
      let remoteError = null;
      let authenticated = false;
      // عند توفر الإنترنت تكون بيانات Firebase هي المصدر المرجعي للخطة والحالة.
      if (navigator.onLine && window.CASHTOP_FIREBASE?.enabled) {
        try { await databaseLogin(key, username, password, remember); authenticated = true; }
        catch (error) { remoteError = error; }
      }
      if (!authenticated) {
        try { await localLogin(key, username, password, remember); authenticated = true; }
        catch (localError) {
          const firebaseReady = Boolean(window.CASHTOP_FIREBASE?.enabled && (window.CASHTOP_FIREBASE?.adminConfig || window.CASHTOP_FIREBASE?.config)?.projectId);
          if (firebaseReady && navigator.onLine && window.CASHTOP_FIREBASE?.authMode === 'firebase-only') {
            await firebaseLogin(key, username, password, remember); authenticated = true;
          } else {
            throw remoteError || localError;
          }
        }
      }
      showStatus('تم تسجيل الدخول بنجاح. جاري فتح لوحة التحكم...', 'success');
      setTimeout(() => location.replace('لوحة التحكم.html'), 450);
    } catch (error) {
      console.error(error);
      let message = String(error.message || 'تعذر تسجيل الدخول.');
      if (String(error.code || '').includes('invalid-credential')) message = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
      showStatus(message, 'error');
      button.disabled = false; button.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول للنظام';
    }
  }

  function displayReason() {
    const reason = new URLSearchParams(location.search).get('reason');
    const messages = {
      expired: 'انتهت مدة مفتاح الشركة، وتم تسجيل خروجك تلقائياً.', stopped: 'تم إيقاف مفتاح الشركة، وتم تسجيل خروجك تلقائياً.',
      deleted: 'تم حذف مفتاح الشركة أو لم يعد متاحاً.', 'user-disabled': 'تم تعطيل حساب المستخدم أو الفرع.',
      'auth-required': 'انتهت جلسة تسجيل الدخول. سجل الدخول مرة أخرى.', 'device-limit': 'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا المفتاح.',
      'permission-denied': 'لا يملك هذا الحساب صلاحية لفتح أي قسم. راجع مدير النظام.'
    };
    if (reason && messages[reason]) showStatus(messages[reason], 'warning');
  }

  cleanupLegacyDemo();
  window.handleLogin = handleLogin;
  window.addEventListener('DOMContentLoaded', () => {
    const existingSession = parse(rawGet('cashtop_session'), null);
    const existingEnd = existingSession?.licenseEnd ? new Date(existingSession.licenseEnd).getTime() : 0;
    if (existingSession && existingSession.status !== 'stopped' && (!existingEnd || existingEnd > Date.now()) && !new URLSearchParams(location.search).get('reason')) {
      location.replace('لوحة التحكم.html'); return;
    }
    const rememberedKey = rawGet('cashtop_remembered_key');
    const rememberedUser = rawGet('cashtop_remembered_user');
    if (rememberedKey) {
      document.getElementById('companyKey').value = rememberedKey;
      document.getElementById('username').value = rememberedUser || '';
      document.getElementById('rememberMe').checked = true;
    }
    const header = document.querySelector('.login-header');
    if (header && !header.querySelector('img')) {
      const img = document.createElement('img'); img.src = 'cashtop-logo.png'; img.alt = 'CASH TOP';
      img.style.cssText = 'width:82px;height:82px;object-fit:cover;border-radius:16px;margin-bottom:10px;box-shadow:0 5px 18px rgba(96,92,168,.2);';
      header.prepend(img);
    }
    displayReason();
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).catch(console.warn));
  }
})();

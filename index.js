const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const auth = getAuth();
const db = getFirestore();

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
}
function requireSuperAdmin(request) {
  requireAuth(request);
  if (request.auth.token.superAdmin !== true) throw new HttpsError('permission-denied', 'صلاحية المشرف العام مطلوبة.');
}
function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}
function cleanLoginPart(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
function usernameToEmail(companyKey, username) {
  if (String(username).includes('@')) return String(username).trim().toLowerCase();
  return `${cleanLoginPart(companyKey)}.${cleanLoginPart(username)}@login.cashtop.app`;
}
async function getLicenseOrThrow(companyKey) {
  const key = normalizeKey(companyKey);
  const snapshot = await db.collection('licenses').doc(key).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'مفتاح الشركة غير موجود.');
  const license = snapshot.data();
  if (license.status !== 'active') throw new HttpsError('failed-precondition', 'مفتاح الشركة موقوف.');
  const endAt = license.endAt?.toDate ? license.endAt.toDate() : new Date(license.endAt);
  if (Number.isFinite(endAt.getTime()) && Date.now() >= endAt.getTime()) throw new HttpsError('failed-precondition', 'مفتاح الشركة منتهي.');
  return { key, license };
}

exports.adminUpsertCompanyUser = onCall(async request => {
  requireSuperAdmin(request);
  const data = request.data || {};
  const { key: companyKey, license } = await getLicenseOrThrow(data.companyKey);
  const username = String(data.username || '').trim();
  if (!username) throw new HttpsError('invalid-argument', 'اسم المستخدم مطلوب.');
  const email = usernameToEmail(companyKey, username);
  const companyId = String(data.companyId || license.companyId || '');
  if (!companyId) throw new HttpsError('invalid-argument', 'معرف الشركة مطلوب.');

  let userRecord;
  if (data.userId) {
    userRecord = await auth.updateUser(data.userId, {
      email,
      password: data.password || undefined,
      displayName: data.displayName || username,
      disabled: data.active === false
    });
  } else {
    const usersSnapshot = await db.collection('users').where('companyId', '==', companyId).get();
    const maxUsers = Number(license.maxUsers || 1);
    if (usersSnapshot.size >= maxUsers) throw new HttpsError('resource-exhausted', `تم الوصول للحد الأقصى للمستخدمين (${maxUsers}).`);
    userRecord = await auth.createUser({
      email,
      password: data.password,
      displayName: data.displayName || username,
      disabled: data.active === false
    });
  }

  const role = data.role || 'employee';
  await auth.setCustomUserClaims(userRecord.uid, { companyId, licenseKey: companyKey, role });
  await db.collection('users').doc(userRecord.uid).set({
    username,
    email,
    displayName: data.displayName || username,
    role,
    active: data.active !== false,
    companyId,
    companyKey,
    licenseKey: companyKey,
    companyName: data.companyName || license.companyName || '',
    updatedAt: FieldValue.serverTimestamp(),
    ...(data.userId ? {} : { createdAt: FieldValue.serverTimestamp() })
  }, { merge: true });
  return { ok: true, userId: userRecord.uid, email };
});

exports.adminDeleteCompanyUser = onCall(async request => {
  requireSuperAdmin(request);
  const userId = String(request.data?.userId || '');
  if (!userId) throw new HttpsError('invalid-argument', 'معرف المستخدم مطلوب.');
  await Promise.allSettled([
    auth.deleteUser(userId),
    db.collection('users').doc(userId).delete()
  ]);
  return { ok: true };
});

exports.registerCompanySession = onCall(async request => {
  requireAuth(request);
  const userSnapshot = await db.collection('users').doc(request.auth.uid).get();
  if (!userSnapshot.exists) throw new HttpsError('permission-denied', 'ملف المستخدم غير موجود.');
  const profile = userSnapshot.data();
  if (profile.active === false) throw new HttpsError('permission-denied', 'المستخدم معطل.');
  const { key, license } = await getLicenseOrThrow(profile.licenseKey);
  const companyId = String(profile.companyId);
  const deviceId = String(request.data?.deviceId || '');
  if (!deviceId) throw new HttpsError('invalid-argument', 'معرف الجهاز مطلوب.');
  const deviceRef = db.collection('companies').doc(companyId).collection('devices').doc(deviceId);
  const devicesRef = db.collection('companies').doc(companyId).collection('devices');
  const cutoff = new Date(Date.now() - 30 * 86400000);

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(deviceRef);
    const activeSnapshot = await transaction.get(devicesRef.where('active', '==', true).where('lastSeenAt', '>=', cutoff));
    const maxDevices = Number(license.maxDevices || 1);
    if (!existing.exists && activeSnapshot.size >= maxDevices) {
      throw new HttpsError('resource-exhausted', `تم الوصول للحد الأقصى للأجهزة (${maxDevices}).`);
    }
    transaction.set(deviceRef, {
      deviceId,
      uid: request.auth.uid,
      companyId,
      licenseKey: key,
      active: true,
      userAgent: String(request.data?.userAgent || '').slice(0, 500),
      lastSeenAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp()
    }, { merge: true });
  });
  return { ok: true };
});

exports.releaseCompanySession = onCall(async request => {
  requireAuth(request);
  const profile = await db.collection('users').doc(request.auth.uid).get();
  if (!profile.exists) return { ok: true };
  const companyId = String(profile.data().companyId || '');
  const deviceId = String(request.data?.deviceId || '');
  if (companyId && deviceId) {
    await db.collection('companies').doc(companyId).collection('devices').doc(deviceId).set({
      active: false,
      lastSeenAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { ok: true };
});

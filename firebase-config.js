/* إعدادات Firebase الموحدة لكاش توب 2 */
window.CASHTOP_FIREBASE = Object.freeze({
  enabled: true, authMode: 'database-first', syncMode: 'realtime-database-rest',
  rootPath: 'cashTopExchange/cashTopPOS', adminRootPath: 'cashTopExchange/cashTopAdmin',
  legacyRootPaths: Object.freeze(['cashTopPOS/v6']),
  config: Object.freeze({
    apiKey: 'AIzaSyBXi8r__d68hQYbyoxXq4MvqqWeAMKt4Sg',
    authDomain: 'meopp-8f1fa.firebaseapp.com',
    databaseURL: 'https://meopp-8f1fa-default-rtdb.firebaseio.com',
    projectId: 'meopp-8f1fa', storageBucket: 'meopp-8f1fa.firebasestorage.app',
    messagingSenderId: '94105308255', appId: '1:94105308255:web:64333017e28dd847e99fea', measurementId: 'G-HMGPNZRLZH'
  }),
  collections: Object.freeze({ licenses:'licenses', users:'users', companies:'companies' })
});

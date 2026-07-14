(function () {
  'use strict';

  const FILE = decodeURIComponent((location.pathname.split('/').pop() || '').replace(/\+/g, ' '));
  const EXCLUDED = new Set(['صفحة تسجيل الدخول.html', 'index.html', 'offline.html']);
  const IS_APP_PAGE = !EXCLUDED.has(FILE);
  const APP_NAME = 'كاش توب 2';
  let deferredInstallPrompt = null;
  let appInstalled = window.matchMedia?.('(display-mode: standalone)')?.matches === true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('cashtop:pwa-ready'));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    appInstalled = true;
    window.dispatchEvent(new CustomEvent('cashtop:pwa-installed'));
  });
  const RAW = {
    get: Storage.prototype.getItem,
    set: Storage.prototype.setItem,
    remove: Storage.prototype.removeItem,
    clear: Storage.prototype.clear,
    key: Storage.prototype.key
  };

  const GLOBAL_KEYS = new Set([
    'cashtop_session',
    'cashtop_remembered_key',
    'cashtop_remembered_user',
    'cashtop_device_id',
    'cashtop_admin_licenses',
    'cashtop_admin_users',
    'cashtop_superadmin_session',
    'cashtop_last_firebase_user',
    'cashtop_firebase_enabled'
  ]);

  const ALIASES = {
    cashtop_funds_db_v4: 'cashtop_funds_db',
    cashtop_clients: 'cashtop_customers',
    cashtop_purchase_invoices: 'cashtop_purchases'
  };

  const DATA_KEYS = [
    'cashtop_products', 'cashtop_customers', 'cashtop_customer_groups',
    'cashtop_suppliers', 'cashtop_supplier_movements', 'cashtop_invoices',
    'cashtop_purchases', 'cashtop_purchase_returns', 'cashtop_expenses',
    'cashtop_expense_types', 'cashtop_funds_db', 'cashtop_vouchers',
    'cashtop_units', 'cashtop_stores', 'cashtop_transfer_history',
    'cashtop_branches', 'cashtop_branch_transfer_history', 'cashtop_employees',
    'cashtop_company_access',
    'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements',
    'cashtop_settings', 'cashtop_db', 'cashtop_printer_settings', 'cashtop_barcode_settings',
    'cashtop_sms_template', 'cashtop_invoice_message_template', 'cashtop_journal', 'cashtop_audit_log',
    'cashtop_sales_offers', 'cashtop_tax_settings',
    'cashtop_notification_settings', 'cashtop_manufacturing_recipes', 'cashtop_manufacturing_orders',
    'cashtop_wastage', 'cashtop_archive_index', 'cashtop_salary_payments'
  ];

  const PERMISSION_GROUPS = [
    { id: 'pages', title: 'صلاحيات الصفحات والأقسام', permissions: [
      ['dashboard.view', 'عرض لوحة التحكم'], ['pos.access', 'فتح الكاشير ونقطة البيع'],
      ['sales.invoices.view', 'عرض فواتير المبيعات'], ['purchases.view', 'عرض فواتير المشتريات'],
      ['purchaseReturns.view', 'عرض مرتجع المشتريات'], ['products.view', 'عرض المنتجات'],
      ['warehouses.view', 'عرض المخازن'], ['branches.view', 'عرض الفروع'], ['units.view', 'عرض الوحدات'],
      ['shortages.view', 'عرض نواقص المخزون'], ['barcode.view', 'فتح مولد الباركود'],
      ['customers.view', 'عرض العملاء'], ['customerGroups.view', 'عرض مجموعات العملاء'],
      ['suppliers.view', 'عرض الموردين'], ['agents.view', 'عرض المناديب'],
      ['accounts.view', 'عرض الحسابات والصناديق'], ['journal.view', 'عرض دفتر القيود'],
      ['vouchers.view', 'عرض سندات القبض والصرف'], ['expenses.view', 'عرض المصاريف'],
      ['reports.view', 'عرض التقارير'], ['employees.view', 'عرض الموظفين'], ['workers.view', 'عرض العمال والأجور'],
      ['manufacturing.view', 'عرض إدارة التصنيع'], ['offers.view', 'عرض عروض المبيعات'],
      ['notifications.view', 'عرض الإشعارات'], ['settings.system', 'فتح إعدادات النظام'],
      ['settings.printer', 'فتح إعدادات الطابعة'], ['settings.tax', 'فتح إعدادات الضريبة'],
      ['settings.storage', 'فتح التخزين والأرشفة'], ['backup.manage', 'فتح النسخ الاحتياطي والاستعادة']
    ]},
    { id: 'sales', title: 'صلاحيات المبيعات والكاشير', permissions: [
      ['sales.create', 'إنشاء وحفظ فاتورة بيع'], ['sales.edit', 'تعديل فاتورة بيع وعكس حركتها'],
      ['sales.delete', 'حذف فاتورة بيع وعكس المخزون والحسابات'], ['sales.print', 'طباعة الفواتير'],
      ['sales.image', 'تنزيل الفاتورة كصورة'], ['sales.discount', 'تطبيق الخصم على المبيعات'],
      ['sales.changePrice', 'تعديل سعر الصنف في الكاشير'], ['sales.credit', 'تسجيل مبيعات آجلة وديون'],
      ['sales.hold', 'تعليق واسترجاع الفواتير'], ['sales.clearCart', 'تفريغ سلة الكاشير']
    ]},
    { id: 'purchases', title: 'صلاحيات المشتريات والموردين', permissions: [
      ['purchases.create', 'إنشاء فاتورة مشتريات متعددة المنتجات'], ['purchases.edit', 'تعديل فاتورة مشتريات'],
      ['purchases.delete', 'حذف فاتورة مشتريات وعكسها'], ['purchases.export', 'تصدير فواتير المشتريات'],
      ['purchases.discount', 'تطبيق خصم المشتريات'],
      ['purchaseReturns.create', 'إنشاء مرتجع مشتريات'], ['purchaseReturns.edit', 'تعديل مرتجع مشتريات'],
      ['purchaseReturns.delete', 'حذف مرتجع مشتريات'], ['purchaseReturns.export', 'تصدير مرتجعات المشتريات'],
      ['suppliers.create', 'إضافة مورد'], ['suppliers.edit', 'تعديل الموردين'],
      ['suppliers.delete', 'حذف الموردين'], ['suppliers.balance', 'إضافة دفعات وديون للموردين'],
      ['suppliers.export', 'تصدير بيانات الموردين']
    ]},
    { id: 'inventory', title: 'صلاحيات المنتجات والمخزون', permissions: [
      ['products.create', 'إضافة منتج'], ['products.edit', 'تعديل المنتجات'], ['products.delete', 'حذف المنتجات'],
      ['products.export', 'تصدير المنتجات'], ['inventory.adjust', 'تعديل كميات المخزون'],
      ['inventory.transfer', 'نقل المخزون بين المخازن والفروع'],
      ['inventory.importExport', 'استيراد وتصدير بيانات المخزون'],
      ['warehouses.manage', 'إضافة وتعديل وحذف المخازن'], ['branches.manage', 'إضافة وتعديل وحذف الفروع'],
      ['units.manage', 'إضافة وتعديل وحذف الوحدات'], ['shortages.supply', 'توريد ومعالجة نواقص المخزون'],
      ['barcode.manage', 'إنشاء وطباعة وتنزيل ملصقات الباركود']
    ]},
    { id: 'customers', title: 'صلاحيات العملاء', permissions: [
      ['customers.create', 'إضافة عميل'], ['customers.edit', 'تعديل العملاء'], ['customers.delete', 'حذف العملاء'],
      ['customers.balance', 'تعديل أرصدة وديون العملاء'], ['customers.export', 'تصدير وطباعة بيانات العملاء'],
      ['customerGroups.manage', 'إدارة مجموعات وتسعير العملاء']
    ]},
    { id: 'finance', title: 'الصلاحيات المالية والمحاسبية', permissions: [
      ['accounts.manage', 'إضافة وتعديل وحذف الصناديق والحسابات'],
      ['finance.transactions', 'إضافة التحويلات والحركات المالية'],
      ['finance.deleteTransactions', 'حذف وعكس الحركات المالية'], ['finance.export', 'تصدير الحسابات والحركات'],
      ['expenses.manage', 'إضافة وتعديل وحذف المصاريف وأنواعها'], ['expenses.export', 'تصدير المصاريف'],
      ['vouchers.manage', 'إضافة وتعديل وحذف السندات'], ['vouchers.export', 'طباعة وتصدير السندات'],
      ['journal.manage', 'إدارة القيود المحاسبية'], ['journal.export', 'تصدير دفتر القيود'],
      ['reports.export', 'تصدير التقارير'], ['reports.send', 'إرسال التقارير عبر قنوات المشاركة']
    ]},
    { id: 'staff', title: 'صلاحيات الموظفين والإدارة', permissions: [
      ['employees.manage', 'إضافة وتعديل وحذف وتعطيل الموظفين'], ['employees.export', 'تصدير بيانات الموظفين'],
      ['permissions.manage', 'تعديل صلاحيات الموظفين'],
      ['workers.manage', 'إضافة وتعديل وحذف العمال'], ['workers.payments', 'صرف رواتب ودفعات وديون العمال'],
      ['workers.export', 'تصدير بيانات العمال'], ['agents.manage', 'إضافة وتعديل وحذف المناديب'],
      ['agents.stock', 'تحميل واسترجاع مخزون المناديب'], ['agents.settle', 'تسوية مبيعات المناديب'],
      ['agents.payments', 'دفعات وحسابات المناديب'], ['agents.export', 'تصدير بيانات وحركات المناديب'],
      ['manufacturing.manage', 'إدارة الوصفات وأوامر التصنيع']
    ]},
    { id: 'system', title: 'صلاحيات النظام الحساسة', permissions: [
      ['settings.edit', 'تعديل إعدادات النظام والشركة وكلمة المرور'], ['settings.sms', 'تعديل قالب رسائل العملاء'],
      ['printer.edit', 'تعديل إعدادات الطابعة والفاتورة'], ['tax.edit', 'تعديل إعدادات الضريبة'],
      ['storage.manage', 'إدارة التخزين والأرشفة'], ['offers.manage', 'إدارة عروض المبيعات'],
      ['notifications.manage', 'إدارة إعدادات الإشعارات'], ['sync.run', 'تشغيل المزامنة اليدوية'],
      ['backup.exportImport', 'تصدير واستيراد نسخة احتياطية'], ['app.install', 'تثبيت تطبيق الويب']
    ]}
  ];

  const PAGE_PERMISSIONS = {
    'لوحة التحكم.html': 'dashboard.view', 'cashier.html': 'pos.access', 'invoices.html': 'sales.invoices.view',
    'المشتريات.html': 'purchases.view', 'مرجع المشتريات.html': 'purchaseReturns.view', 'products.html': 'products.view',
    'warehouses.html': 'warehouses.view', 'branches.html': 'branches.view', 'units.html': 'units.view',
    'shortages.html': 'shortages.view', 'barcode-generator.html': 'barcode.view', 'customers.html': 'customers.view',
    'customer-groups.html': 'customerGroups.view', 'suppliers.html': 'suppliers.view', 'المناديب.html': 'agents.view',
    'accounts.html': 'accounts.view', 'journal.html': 'journal.view', 'sands.html': 'vouchers.view',
    'المصاريف.html': 'expenses.view', 'التقارير.html': 'reports.view', 'الموظفين.html': 'employees.view',
    'العمال والاجور.html': 'workers.view', 'ادارة التصنيع.html': 'manufacturing.view', 'sales-offers.html': 'offers.view',
    'notifications.html': 'notifications.view', 'setting.html': 'settings.system', 'printer-settings.html': 'settings.printer',
    'tax-settings.html': 'settings.tax', 'storage-settings.html': 'settings.storage',
    'استيراد وتصدير ل كل قسم.html': 'backup.manage'
  };

  // Action-level permissions are applied to existing and dynamically-created
  // controls. This supplements page access with granular create/edit/delete/
  // payment/transfer/export restrictions without changing page business logic.
  const ACTION_PERMISSION_MAP = {
    'accounts.html': {
      openAddAccountModal: 'accounts.manage', editAccount: 'accounts.manage', saveAccount: 'accounts.manage',
      confirmDeleteAccount: 'accounts.manage', executeDelete: 'accounts.manage',
      handleTransfer: 'finance.transactions',
      exportAllAccountsExcel: 'finance.export', exportAllAccountsPDF: 'finance.export',
      exportAccountExcel: 'finance.export', exportAccountPDF: 'finance.export'
    },
    'barcode-generator.html': {
      addCurrentToLabelsGrid: 'barcode.manage', triggerPrint: 'barcode.manage',
      downloadPreviewAsImage: 'barcode.manage', clearPreviewZone: 'barcode.manage'
    },
    'branches.html': {
      openTransferModal: 'inventory.transfer', openTransferVariantModal: 'inventory.transfer',
      processTransfer: 'inventory.transfer', addProdToTransferCart: 'inventory.transfer', addVariantToTransfer: 'inventory.transfer',
      openEditBranchModal: 'branches.manage', openDeleteBranchModal: 'branches.manage',
      saveBranch: 'branches.manage', saveEditedBranch: 'branches.manage', saveManager: 'branches.manage',
      toggleBranchStatus: 'branches.manage', confirmDeleteBranch: 'branches.manage',
      exportHistoryExcel: 'products.export', exportHistoryPdf: 'products.export'
    },
    'cashier.html': {
      holdInvoice: 'sales.hold', openSuspendedModal: 'sales.hold', clearBasket: 'sales.clearCart',
      applyDiscountValue: 'sales.discount', handleQuickProductSubmit: 'products.create'
    },
    'customer-groups.html': {
      openGroupModal: 'customerGroups.manage', saveGroupData: 'customerGroups.manage',
      selectAllCustomers: 'customerGroups.manage', triggerPrint: 'customers.export'
    },
    'customers.html': {
      editCustomer: 'customers.edit', deleteCustomer: 'customers.delete',
      exportTableToExcel: 'customers.export', exportTableToPDF: 'customers.export',
      exportTableToImage: 'customers.export', exportRowPDF: 'customers.export', exportRowImage: 'customers.export'
    },
    'notifications.html': { openSettings: 'notifications.manage', saveSettings: 'notifications.manage', payEmployeeSalary: 'employees.manage' },
    'printer-settings.html': { savePrinterSettings: 'printer.edit', saveBarcodeSettings: 'printer.edit' },
    'products.html': {
      openProductModal: 'products.create', stageCurrentProduct: 'products.create', saveFinalPurchase: 'products.create',
      addVariantRow: 'products.create', editProduct: 'products.edit', editStagedItem: 'products.edit',
      deleteProduct: 'products.delete', deleteStagedItem: 'products.delete',
      openAdvancedTransferModal: 'inventory.transfer', openTransferVariantSelector: 'inventory.transfer',
      confirmTransferAction: 'inventory.transfer', addProdToTransfer: 'inventory.transfer', addVariantToTransferById: 'inventory.transfer',
      exportExcel: 'products.export', exportPDF: 'products.export', exportImage: 'products.export',
      exportTransferExcel: 'products.export', exportTransferPDF: 'products.export', exportTransferImage: 'products.export'
    },
    'sales-offers.html': {
      'offerPage.openModal': 'offers.manage', 'offerPage.save': 'offers.manage', 'offerPage.edit': 'offers.manage',
      'offerPage.remove': 'offers.manage', 'offerPage.exportAll': 'reports.export', 'offerPage.exportOne': 'reports.export'
    },
    'sands.html': {
      openVoucherModal: 'vouchers.manage', saveVoucher: 'vouchers.manage', editVoucher: 'vouchers.manage',
      confirmDelete: 'vouchers.manage', executeDelete: 'vouchers.manage',
      exportAllVouchersExcel: 'vouchers.export', exportAllVouchersPDF: 'vouchers.export',
      exportAllVouchersImage: 'vouchers.export', exportVoucherPDF: 'vouchers.export',
      exportVoucherImage: 'vouchers.export', printVoucher: 'vouchers.export'
    },
    'setting.html': {
      saveSystemSettings: 'settings.edit', openPasswordModal: 'settings.edit',
      handlePasswordChange: 'settings.edit', saveSmsSettings: 'settings.sms', insertVariable: 'settings.sms'
    },
    'shortages.html': {
      openOrderModal: 'shortages.supply', openProductModal: 'products.create',
      handleQuickSupply: 'shortages.supply', saveQuickProduct: 'products.create'
    },
    'storage-settings.html': { runCompaction: 'storage.manage', saveStorage: 'storage.manage' },
    'suppliers.html': {
      openAddSupplierModal: 'suppliers.create', editSupplier: 'suppliers.edit', saveSupplier: ['suppliers.create', 'suppliers.edit'],
      executePayment: 'suppliers.balance', executeManualDebt: 'suppliers.balance',
      confirmDelete: 'suppliers.delete', executeDelete: 'suppliers.delete',
      exportAllSuppliersExcel: 'suppliers.export', exportAllSuppliersPDF: 'suppliers.export',
      exportIndividualPDF: 'suppliers.export', exportIndividualExcel: 'suppliers.export'
    },
    'tax-settings.html': { saveTax: 'tax.edit' },
    'units.html': { openModal: 'units.manage', saveUnit: 'units.manage', editUnit: 'units.manage', deleteUnit: 'units.manage' },
    'warehouses.html': {
      openTransferModal: 'inventory.transfer', openTransferVariantModal: 'inventory.transfer', processTransfer: 'inventory.transfer',
      addProdToTransferCart: 'inventory.transfer', addVariantToTransfer: 'inventory.transfer',
      saveStockAdjustment: 'inventory.adjust', openEditModal: 'inventory.adjust', openDeleteModal: 'inventory.adjust',
      confirmDeleteProduct: 'inventory.adjust', saveNewStore: 'warehouses.manage',
      exportHistoryExcel: 'products.export', exportHistoryPdf: 'products.export',
      openExportModal: 'products.export', executeExport: 'products.export', exportToExcel: 'products.export', exportToPdf: 'products.export'
    },
    'ادارة التصنيع.html': {
      openRecipe: 'manufacturing.manage', openProduction: 'manufacturing.manage', saveRecipe: 'manufacturing.manage',
      addIngredient: 'manufacturing.manage', executeProduction: 'manufacturing.manage'
    },
    'استيراد وتصدير ل كل قسم.html': {
      triggerFullBackup: 'backup.exportImport', triggerFullRestore: 'backup.exportImport', handleFullRestore: 'backup.exportImport',
      exportSection: 'backup.exportImport', importSection: 'backup.exportImport', handleSectionImport: 'backup.exportImport'
    },
    'التقارير.html': { exportExcel: 'reports.export', exportPDF: 'reports.export', sendReport: 'reports.send' },
    'العمال والاجور.html': {
      openAddModal: 'workers.manage', openEditWorker: 'workers.manage', openDeleteWorker: 'workers.manage',
      saveWorker: ['workers.manage'], confirmDeleteWorker: 'workers.manage',
      openPayWorker: 'workers.payments', openDebtWorker: 'workers.payments',
      executePayment: 'workers.payments', executeDebt: 'workers.payments',
      exportToExcel: 'workers.export', exportToPDF: 'workers.export'
    },
    'المشتريات.html': {
      addNewProductRow: 'purchases.create', savePurchaseInvoice: 'purchases.create',
      openEditModal: 'purchases.edit', saveEditInvoice: 'purchases.edit',
      openDeleteModal: 'purchases.delete', confirmDeleteInvoice: 'purchases.delete',
      exportExcel: 'purchases.export', exportPDF: 'purchases.export'
    },
    'المصاريف.html': {
      openExpenseModal: 'expenses.manage', openEditExpense: 'expenses.manage', openTypeModal: 'expenses.manage',
      saveExpense: 'expenses.manage', saveExpenseType: 'expenses.manage',
      openDeleteExpenseModal: 'expenses.manage', executeDeleteExpense: 'expenses.manage',
      exportExcel: 'expenses.export', exportPDF: 'expenses.export'
    },
    'المناديب.html': {
      openAgentModal: 'agents.manage', saveAgent: 'agents.manage', openDeleteAgentModal: 'agents.manage',
      confirmDeleteAgent: 'agents.manage', openStockLoadModal: 'agents.stock', processLoadAction: 'agents.stock',
      openSettleModal: 'agents.settle', processSettlement: 'agents.settle',
      openPayModal: 'agents.payments', openPayRepModal: 'agents.payments', processPayment: 'agents.payments', processPayRep: 'agents.payments',
      exportMainExcel: 'agents.export', exportMainPDF: 'agents.export',
      exportAgentHistoryExcel: 'agents.export', exportAgentHistoryPDF: 'agents.export'
    },
    'الموظفين.html': {
      openAddModal: 'employees.manage', openEditModal: 'employees.manage', openDeleteModal: 'employees.manage',
      saveEmployee: 'employees.manage', confirmDelete: 'employees.manage', toggleEmployeeStatus: 'employees.manage',
      setAllPermissions: 'permissions.manage', exportToExcel: 'employees.export', exportToPDF: 'employees.export'
    },
    'مرجع المشتريات.html': {
      addNewProductRow: 'purchaseReturns.create', savePurchaseReturn: 'purchaseReturns.create',
      openEditReturn: 'purchaseReturns.edit', saveEditReturn: 'purchaseReturns.edit',
      openDeleteReturn: 'purchaseReturns.delete', confirmDeleteReturn: 'purchaseReturns.delete',
      exportExcel: 'purchaseReturns.export', exportPDF: 'purchaseReturns.export'
    }
  };

  const ACTION_SELECTOR_RULES = {
    'customers.html': [
      ['#openCustomerModalBtn', 'customers.create'],
      ['#customerForm', ['customers.create', 'customers.edit']]
    ],
    'warehouses.html': [['form[onsubmit*="saveNewStore"]', 'warehouses.manage']],
    'setting.html': [
      ['form[onsubmit*="saveSystemSettings"]', 'settings.edit'],
      ['form[onsubmit*="saveSmsSettings"]', 'settings.sms']
    ]
  };

  const LEGACY_PERMISSION_MAP = {
    dashboard: ['dashboard.view'],
    pos: ['pos.access', 'sales.create', 'sales.edit', 'sales.delete', 'sales.print', 'sales.image', 'sales.discount', 'sales.changePrice', 'sales.credit', 'sales.hold', 'sales.clearCart'],
    products: ['products.view', 'warehouses.view', 'branches.view', 'units.view', 'shortages.view', 'barcode.view', 'products.create', 'products.edit', 'products.delete', 'products.export', 'inventory.adjust', 'inventory.transfer', 'inventory.importExport', 'warehouses.manage', 'branches.manage', 'units.manage', 'shortages.supply', 'barcode.manage'],
    customers: ['customers.view', 'customerGroups.view', 'sales.invoices.view', 'customers.create', 'customers.edit', 'customers.delete', 'customers.balance', 'customers.export', 'customerGroups.manage'],
    suppliers: ['suppliers.view', 'purchases.view', 'purchaseReturns.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.export', 'purchases.discount', 'purchaseReturns.create', 'purchaseReturns.edit', 'purchaseReturns.delete', 'purchaseReturns.export', 'suppliers.create', 'suppliers.edit', 'suppliers.delete', 'suppliers.balance', 'suppliers.export'],
    funds: ['accounts.view', 'journal.view', 'vouchers.view', 'expenses.view', 'accounts.manage', 'finance.transactions', 'finance.deleteTransactions', 'finance.export', 'expenses.manage', 'expenses.export', 'vouchers.manage', 'vouchers.export', 'journal.manage', 'journal.export'],
    reports: ['reports.view', 'reports.export', 'reports.send'],
    settings: ['employees.view', 'workers.view', 'agents.view', 'manufacturing.view', 'offers.view', 'notifications.view', 'settings.system', 'settings.printer', 'settings.tax', 'settings.storage', 'backup.manage', 'employees.manage', 'employees.export', 'permissions.manage', 'workers.manage', 'workers.payments', 'workers.export', 'agents.manage', 'agents.stock', 'agents.settle', 'agents.payments', 'agents.export', 'manufacturing.manage', 'settings.edit', 'settings.sms', 'printer.edit', 'tax.edit', 'storage.manage', 'offers.manage', 'notifications.manage', 'sync.run', 'backup.exportImport', 'app.install']
  };

  function normalizePermissions(input) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {};
    Object.entries(source).forEach(([key, value]) => {
      if (key.includes('.')) normalized[key] = value === true;
      else if (LEGACY_PERMISSION_MAP[key] && value === true) LEGACY_PERMISSION_MAP[key].forEach(permission => { normalized[permission] = true; });
    });
    return normalized;
  }

  function can(permission, session = getSession()) {
    if (!permission) return true;
    if (!session) return false;
    if (['admin', 'owner', 'superadmin'].includes(String(session.role || '').toLowerCase())) return true;
    const normalized = normalizePermissions(session.permissions);
    if (Object.keys(normalized).length === 0) {
      return String(session.role || '').toLowerCase() !== 'employee';
    }
    return normalized[permission] === true;
  }

  const NON_ARRAY_DEFAULTS = {
    cashtop_funds_db: { version: 5, accounts: [], accountLogs: [] },
    cashtop_settings: {},
    cashtop_company_access: {},
    cashtop_printer_settings: {},
    cashtop_barcode_settings: {},
    cashtop_sms_template: '',
    cashtop_invoice_message_template: 'مرحباً {name}، فاتورتك رقم {invoice} لدى {store}. الأصناف:\n{items}\nالإجمالي: {total}، المدفوع: {paid}، المتبقي: {balance}.',
    cashtop_tax_settings: { enabled: false, salesRate: 0, purchaseRate: 0, salesBearer: 'customer', purchaseBearer: 'business', pricesIncludeTax: false },
    cashtop_notification_settings: { lowStockThreshold: 5, debtOverdueDays: 30, inactiveCustomerDays: 45, expiryWarningDays: 30, enabled: true },
    cashtop_archive_index: { lastCompactionAt: 0, archivedCounts: {} }
  };

  function rawGet(key) { return RAW.get.call(localStorage, key); }
  function rawSet(key, value) { RAW.set.call(localStorage, key, String(value)); }
  function rawRemove(key) { RAW.remove.call(localStorage, key); }
  function safeJson(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function normalizeArrayValue(value, fallback = []) {
    let parsed = value;
    // Firebase login/bootstrap data can arrive as an encoded JSON string, a
    // normal array, or an object keyed by numeric/Firebase ids. Normalize all
    // three shapes so callers never fail on .find/.filter/.map.
    for (let i = 0; i < 2 && typeof parsed === 'string'; i += 1) {
      const decoded = safeJson(parsed, null);
      if (decoded === null) break;
      parsed = decoded;
    }
    if (Array.isArray(parsed)) return parsed.filter(item => item != null);
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([key, item]) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && item.id == null && !/^\d+$/.test(key)) {
          return { ...item, id: key };
        }
        return item;
      }).filter(item => item != null);
    }
    return Array.isArray(fallback) ? [...fallback] : [];
  }
  function canonicalKey(key) { return ALIASES[key] || key; }
  function getSession() { return safeJson(rawGet('cashtop_session'), null); }
  function companyIdFromSession() {
    const session = getSession();
    return session && (session.companyId || session.companyKey) ? String(session.companyId || session.companyKey) : 'unassigned';
  }
  function namespaceKey(key, companyId = companyIdFromSession()) {
    return `cashtop_data::${encodeURIComponent(companyId)}::${canonicalKey(key)}`;
  }
  function metaKey(key, companyId = companyIdFromSession()) {
    return `cashtop_meta::${encodeURIComponent(companyId)}::${canonicalKey(key)}`;
  }
  function isManagedKey(key) {
    return typeof key === 'string' && key.startsWith('cashtop_') && !GLOBAL_KEYS.has(key) &&
      !key.startsWith('cashtop_data::') && !key.startsWith('cashtop_meta::');
  }
  function getDeviceId() {
    let id = rawGet('cashtop_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      rawSet('cashtop_device_id', id);
    }
    return id;
  }


  function syncQueueKey() {
    return `ct_sync_queue::${encodeURIComponent(companyIdFromSession())}`;
  }

  function getSyncQueue() {
    const queue = safeJson(rawGet(syncQueueKey()), []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeSyncQueue(queue) {
    const normalized = Array.isArray(queue) ? queue.slice(-1200) : [];
    rawSet(syncQueueKey(), JSON.stringify(normalized));
    updateSyncBadge();
    window.dispatchEvent(new CustomEvent('cashtop:sync-queue-changed', { detail: { count: normalized.length } }));
    return normalized;
  }

  function enqueueSyncOperation(key) {
    const canonical = canonicalKey(key);
    const queue = getSyncQueue();
    // Only one pending upload is needed per dataset: Firebase receives the latest
    // complete dataset value, so repeated edits before a flush are one sync job.
    const existing = queue.find(item => item.key === canonical);
    if (existing) {
      existing.createdAt = Date.now();
      existing.deviceId = getDeviceId();
      existing.page = FILE;
      writeSyncQueue(queue);
      return existing.id;
    }
    const operation = {
      id: crypto.randomUUID ? crypto.randomUUID() : `SYNC_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      key: canonical,
      createdAt: Date.now(),
      deviceId: getDeviceId(),
      page: FILE
    };
    queue.push(operation);
    writeSyncQueue(queue);
    return operation.id;
  }

  function completeSyncOperation(operationId) {
    if (!operationId) return getSyncQueue().length;
    const queue = getSyncQueue();
    const index = queue.findIndex(item => item.id === operationId);
    if (index >= 0) queue.splice(index, 1);
    writeSyncQueue(queue);
    return queue.length;
  }

  function clearSyncQueue() {
    return writeSyncQueue([]);
  }

  function updateSyncBadge() {
    const count = getSyncQueue().length;
    const button = document.getElementById('ctSyncButton');
    const badge = document.getElementById('ctSyncBadge');
    if (badge) {
      badge.textContent = count > 999 ? '999+' : String(count);
      badge.hidden = count === 0;
    }
    if (button) button.title = count ? `عمليات بانتظار المزامنة: ${count}` : 'البيانات متزامنة';
    return count;
  }

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('cashtop-app') : null;
  let suppressEvents = false;

  function appendAudit(key, oldValue, newValue, actionOverride) {
    const canonical = canonicalKey(key);
    if (canonical === 'cashtop_audit_log' || canonical === 'cashtop_journal') return;
    const session = getSession() || {};
    const auditNs = namespaceKey('cashtop_audit_log');
    const list = safeJson(rawGet(auditNs), []) || [];
    const oldParsed = safeJson(oldValue, oldValue);
    const newParsed = safeJson(newValue, newValue);
    let action = actionOverride || 'update';
    if (Array.isArray(oldParsed) && Array.isArray(newParsed)) {
      if (newParsed.length > oldParsed.length) action = 'create';
      else if (newParsed.length < oldParsed.length) action = 'delete';
    } else if (oldValue == null && newValue != null) action = 'create';
    else if (newValue == null) action = 'delete';

    list.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `AUD_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      companyId: session.companyId || session.companyKey || null,
      branchId: branchIdFromSession(session),
      userId: session.uid || session.username || null,
      username: session.username || session.displayName || 'غير معروف',
      role: session.role || 'user',
      page: FILE,
      dataset: canonical,
      action,
      oldSummary: summarizeValue(oldParsed),
      newSummary: summarizeValue(newParsed),
      deviceId: getDeviceId()
    });
    if (list.length > 2000) list.splice(0, list.length - 2000);
    rawSet(auditNs, JSON.stringify(list));
  }

  function summarizeValue(value) {
    if (Array.isArray(value)) return { type: 'array', count: value.length };
    if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 30) };
    if (typeof value === 'string') return value.slice(0, 180);
    return value;
  }

  function dispatchLogicalStorageEvents(key, oldValue, newValue) {
    const canonical = canonicalKey(key);
    const logicalKeys = [canonical, ...Object.keys(ALIASES).filter(alias => ALIASES[alias] === canonical)];
    logicalKeys.forEach(logicalKey => {
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: logicalKey,
          oldValue: oldValue == null ? null : String(oldValue),
          newValue: newValue == null ? null : String(newValue),
          url: location.href,
          storageArea: localStorage
        }));
      } catch (_) {
        const event = new Event('storage');
        Object.defineProperties(event, {
          key: { value: logicalKey }, oldValue: { value: oldValue }, newValue: { value: newValue },
          url: { value: location.href }, storageArea: { value: localStorage }
        });
        window.dispatchEvent(event);
      }
    });
  }

  function emitDataChange(key, oldValue, value, source = 'local', operationId = null) {
    if (suppressEvents) return;
    const detail = {
      key: canonicalKey(key),
      oldValue,
      value,
      companyId: companyIdFromSession(),
      updatedAt: Date.now(),
      source,
      deviceId: getDeviceId(),
      operationId
    };
    window.dispatchEvent(new CustomEvent('cashtop:data-changed', { detail }));
    if (channel) channel.postMessage({ type: 'data-change', ...detail });
  }

  function migrateLegacyValue(key) {
    const canonical = canonicalKey(key);
    const ns = namespaceKey(canonical);
    let current = rawGet(ns);
    if (current !== null) return current;

    const candidates = [canonical, ...Object.keys(ALIASES).filter(k => ALIASES[k] === canonical)];
    for (const candidate of candidates) {
      const legacy = rawGet(candidate);
      if (legacy !== null) {
        rawSet(ns, legacy);
        rawSet(metaKey(canonical), JSON.stringify({ updatedAt: Date.now(), revision: 1, migratedFrom: candidate }));
        candidates.forEach(rawRemove);
        return legacy;
      }
    }
    return null;
  }


  const BRANCH_SCOPED_ARRAY_KEYS = new Set([
    'cashtop_customers', 'cashtop_customer_groups', 'cashtop_suppliers', 'cashtop_supplier_movements',
    'cashtop_invoices', 'cashtop_purchases', 'cashtop_purchase_returns', 'cashtop_expenses',
    'cashtop_expense_types', 'cashtop_vouchers', 'cashtop_stores', 'cashtop_transfer_history',
    'cashtop_workers', 'cashtop_sales_agents', 'cashtop_agent_movements', 'cashtop_journal',
    'cashtop_audit_log', 'cashtop_sales_offers', 'cashtop_manufacturing_recipes',
    'cashtop_manufacturing_orders', 'cashtop_wastage'
  ]);
  const BRANCH_SCOPED_OBJECT_KEYS = new Set(['cashtop_funds_db']);

  function isCompanyAdminRole(role) {
    return ['admin', 'owner', 'company-admin'].includes(String(role || '').toLowerCase());
  }

  function deepClone(value) {
    if (value == null) return value;
    try { return structuredClone(value); } catch (_) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }
  }

  function fullDatasetValue(key, fallback = null, companyId = companyIdFromSession()) {
    const raw = rawGet(namespaceKey(canonicalKey(key), companyId));
    if (raw == null) return fallback;
    return safeJson(raw, fallback);
  }

  function branchIdFromSession(session = getSession()) {
    session = session || {};
    if (session.dataBranchId) return String(session.dataBranchId);
    const role = String(session.role || '').toLowerCase();
    if (isCompanyAdminRole(role)) return 'MAIN';
    const recordId = session.branchRecordId || session.branchId;
    if (!recordId) return 'MAIN';
    const companyId = session.companyId || session.companyKey || companyIdFromSession();
    const branches = normalizeArrayValue(fullDatasetValue('cashtop_branches', [], companyId), []);
    const branch = branches.find(item => String(item.id) === String(recordId));
    return branch?.isMain === true ? 'MAIN' : String(recordId);
  }

  function recordBranchId(record) {
    const value = record && (record.dataBranchId || record.branchId);
    return value == null || value === '' ? 'MAIN' : String(value);
  }

  function sameBranch(record, branchId = branchIdFromSession()) {
    return recordBranchId(record) === String(branchId || 'MAIN');
  }

  function productVisibleInBranch(product, branchId) {
    if (!product || typeof product !== 'object') return false;
    const branch = String(branchId || 'MAIN');
    const catalog = product.branchCatalog && typeof product.branchCatalog === 'object' ? product.branchCatalog : {};
    if (branch === 'MAIN') {
      if (catalog.MAIN === true || String(product.ownerBranchId || 'MAIN') === 'MAIN') return true;
      if (!Object.keys(catalog).length && product.ownerBranchId == null) return true; // legacy product
      return Number(product.stockPieces || 0) !== 0 || Array.isArray(product.inventoryLots) && product.inventoryLots.length > 0;
    }
    if (catalog[branch] === true || String(product.ownerBranchId || '') === branch) return true;
    if (product.branchStocks && Object.prototype.hasOwnProperty.call(product.branchStocks, branch)) return true;
    if (product.branchInventoryLots && Array.isArray(product.branchInventoryLots[branch])) return true;
    return Array.isArray(product.variants) && product.variants.some(v => v?.branchStocks && Object.prototype.hasOwnProperty.call(v.branchStocks, branch));
  }

  function projectProductForBranch(product, branchId) {
    const branch = String(branchId || 'MAIN');
    const clone = deepClone(product) || {};
    clone.__ctDataBranchId = branch;
    if (branch === 'MAIN') {
      clone.inventoryLots = normalizeArrayValue(product.inventoryLots || [], []).filter(lot => recordBranchId(lot) === 'MAIN');
      if (Array.isArray(clone.variants)) clone.variants.forEach((variant, index) => { variant.qty = Number(product.variants?.[index]?.qty || 0); });
      return clone;
    }
    clone.stockPieces = Math.max(0, Number(product.branchStocks?.[branch] || 0));
    clone.inventoryLots = deepClone(product.branchInventoryLots?.[branch] || normalizeArrayValue(product.inventoryLots || [], []).filter(lot => recordBranchId(lot) === branch)) || [];
    if (Array.isArray(clone.variants)) {
      clone.variants.forEach((variant, index) => {
        const original = product.variants?.[index] || variant;
        variant.qty = Math.max(0, Number(original.branchStocks?.[branch] || 0));
      });
    }
    return clone;
  }

  function projectProducts(rawValue) {
    const branch = branchIdFromSession();
    return JSON.stringify(normalizeArrayValue(rawValue, []).filter(product => productVisibleInBranch(product, branch)).map(product => projectProductForBranch(product, branch)));
  }

  function variantIdentity(variant, index) {
    return String(variant?.id || variant?.barcode || `${variant?.size || ''}::${variant?.color || ''}::${index}`);
  }

  function mergeProductForBranch(existing, incoming, branchId) {
    const branch = String(branchId || 'MAIN');
    const source = deepClone(incoming) || {};
    delete source.__ctDataBranchId;
    let target = existing ? deepClone(existing) : {};
    const preserved = {
      stockPieces: Number(target.stockPieces || 0),
      inventoryLots: deepClone(target.inventoryLots || []),
      branchStocks: deepClone(target.branchStocks || {}),
      branchInventoryLots: deepClone(target.branchInventoryLots || {}),
      branchCatalog: deepClone(target.branchCatalog || {}),
      variants: deepClone(target.variants || [])
    };
    const skip = new Set(['stockPieces','inventoryLots','branchStocks','branchInventoryLots','branchCatalog','variants','__ctDataBranchId']);
    Object.entries(source).forEach(([key, value]) => { if (!skip.has(key)) target[key] = deepClone(value); });
    target.id = target.id || source.id || `P_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    target.branchStocks = preserved.branchStocks || {};
    target.branchInventoryLots = preserved.branchInventoryLots || {};
    target.branchCatalog = preserved.branchCatalog || {};
    const oldVariants = preserved.variants || [];
    const oldById = new Map(oldVariants.map((v,i) => [variantIdentity(v,i), v]));
    target.variants = normalizeArrayValue(source.variants || [], []).map((variant, index) => {
      const old = oldById.get(variantIdentity(variant,index)) || oldVariants[index] || {};
      const merged = { ...deepClone(old), ...deepClone(variant) };
      merged.branchStocks = deepClone(old.branchStocks || variant.branchStocks || {});
      if (branch === 'MAIN') merged.qty = Math.max(0, Number(variant.qty || 0));
      else {
        merged.qty = Math.max(0, Number(old.qty || 0));
        merged.branchStocks[branch] = Math.max(0, Number(variant.qty || 0));
      }
      return merged;
    });
    if (branch === 'MAIN') {
      target.stockPieces = Math.max(0, Number(source.stockPieces || 0));
      target.inventoryLots = normalizeArrayValue(source.inventoryLots || [], []).map(lot => ({ ...deepClone(lot), branchId: 'MAIN' }));
      target.branchCatalog.MAIN = true;
      target.ownerBranchId = target.ownerBranchId || 'MAIN';
    } else {
      target.stockPieces = preserved.stockPieces;
      target.inventoryLots = preserved.inventoryLots;
      target.branchStocks[branch] = Math.max(0, Number(source.stockPieces || 0));
      target.branchInventoryLots[branch] = normalizeArrayValue(source.inventoryLots || [], []).map(lot => ({ ...deepClone(lot), branchId: branch }));
      target.branchCatalog[branch] = true;
      target.ownerBranchId = target.ownerBranchId || branch;
    }
    return target;
  }

  function productHasAnyBranch(product) {
    if (Number(product.stockPieces || 0) > 0 || product.branchCatalog?.MAIN === true) return true;
    if (Object.values(product.branchStocks || {}).some(value => Number(value || 0) > 0)) return true;
    if (Object.values(product.branchCatalog || {}).some(Boolean)) return true;
    return Array.isArray(product.variants) && product.variants.some(v => Number(v.qty || 0) > 0 || Object.values(v.branchStocks || {}).some(value => Number(value || 0) > 0));
  }

  function mergeProducts(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const full = normalizeArrayValue(rawOld, []);
    const incoming = normalizeArrayValue(incomingValue, []);
    const incomingIds = new Set(incoming.map(p => String(p.id)));
    const byId = new Map(full.map(p => [String(p.id), p]));
    incoming.forEach(item => byId.set(String(item.id), mergeProductForBranch(byId.get(String(item.id)), item, branch)));
    for (const product of full) {
      if (!productVisibleInBranch(product, branch) || incomingIds.has(String(product.id))) continue;
      const target = byId.get(String(product.id));
      if (branch === 'MAIN') {
        target.stockPieces = 0; target.inventoryLots = [];
        if (target.branchCatalog) delete target.branchCatalog.MAIN;
        (target.variants || []).forEach(v => { v.qty = 0; });
      } else {
        if (target.branchStocks) delete target.branchStocks[branch];
        if (target.branchInventoryLots) delete target.branchInventoryLots[branch];
        if (target.branchCatalog) delete target.branchCatalog[branch];
        (target.variants || []).forEach(v => { if (v.branchStocks) delete v.branchStocks[branch]; });
      }
      if (!productHasAnyBranch(target)) byId.delete(String(product.id));
    }
    return JSON.stringify([...byId.values()]);
  }

  function projectBranchArray(rawValue) {
    const branch = branchIdFromSession();
    return JSON.stringify(normalizeArrayValue(rawValue, []).filter(item => sameBranch(item, branch)));
  }

  function recordIdentity(record, index) {
    return String(record?.id || record?.invoiceId || record?.code || record?.number || `IDX_${index}`);
  }

  function mergeBranchArray(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const old = normalizeArrayValue(rawOld, []);
    const incoming = normalizeArrayValue(incomingValue, []).map(item => ({ ...deepClone(item), branchId: branch }));
    const keep = old.filter(item => !sameBranch(item, branch));
    return JSON.stringify([...keep, ...incoming]);
  }

  function projectFunds(rawValue) {
    const branch = branchIdFromSession();
    const db = safeJson(rawValue, {}) || {};
    return JSON.stringify({
      ...db,
      accounts: normalizeArrayValue(db.accounts || [], []).filter(item => sameBranch(item, branch)),
      accountLogs: normalizeArrayValue(db.accountLogs || [], []).filter(item => sameBranch(item, branch))
    });
  }

  function mergeFunds(rawOld, incomingValue) {
    const branch = branchIdFromSession();
    const old = safeJson(rawOld, {}) || {};
    const incoming = safeJson(incomingValue, {}) || {};
    return JSON.stringify({
      ...old, ...incoming,
      accounts: [
        ...normalizeArrayValue(old.accounts || [], []).filter(item => !sameBranch(item, branch)),
        ...normalizeArrayValue(incoming.accounts || [], []).map(item => ({ ...deepClone(item), branchId: branch }))
      ],
      accountLogs: [
        ...normalizeArrayValue(old.accountLogs || [], []).filter(item => !sameBranch(item, branch)),
        ...normalizeArrayValue(incoming.accountLogs || [], []).map(item => ({ ...deepClone(item), branchId: branch }))
      ]
    });
  }

  function getCompanyAccess() {
    return fullDatasetValue('cashtop_company_access', {}) || {};
  }

  const PLUS_LIMITS = Object.freeze({ products:200, suppliers:50, branches:2, storesPerBranch:2, employeesPerBranch:3, invoicesDailyPerBranch:200, expensesDailyCompany:20, customersDailyCompany:100, purchasesDailyCompany:10 });
  function currentPlan() {
    const session = getSession() || {};
    const access = getCompanyAccess();
    return String(access.plan || session.plan || 'pro').toLowerCase() === 'plus' ? 'plus' : 'pro';
  }
  function dateKey(value) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function isTodayRecord(record) { return dateKey(record?.date || record?.createdAt || record?.timestamp || record?.updatedAt) === dateKey(Date.now()); }
  function countBranch(array, branch) { return normalizeArrayValue(array, []).filter(item => sameBranch(item, branch)).length; }
  function quotaViolation(canonical, oldRaw, newRaw) {
    if (currentPlan() !== 'plus') return '';
    const branch = branchIdFromSession();
    const oldVal = safeJson(oldRaw, canonical === 'cashtop_funds_db' ? {} : []);
    const newVal = safeJson(newRaw, canonical === 'cashtop_funds_db' ? {} : []);
    const grewPast = (oldCount, newCount, limit, label) => newCount > limit && newCount > oldCount ? `وصلت خطة Plus إلى حد ${label} (${limit}).` : '';
    if (canonical === 'cashtop_products') return grewPast(countBranchProducts(oldVal, branch), countBranchProducts(newVal, branch), PLUS_LIMITS.products, 'المنتجات لكل فرع');
    if (canonical === 'cashtop_suppliers') return grewPast(countBranch(oldVal, branch), countBranch(newVal, branch), PLUS_LIMITS.suppliers, 'الموردين لكل فرع');
    if (canonical === 'cashtop_branches') return grewPast(normalizeArrayValue(oldVal, []).length, normalizeArrayValue(newVal, []).length, PLUS_LIMITS.branches, 'الفروع');
    if (canonical === 'cashtop_stores') return grewPast(countBranch(oldVal, branch), countBranch(newVal, branch), PLUS_LIMITS.storesPerBranch, 'المخازن لكل فرع');
    if (canonical === 'cashtop_employees') {
      const oldCounts = employeeCounts(oldVal), newCounts = employeeCounts(newVal);
      for (const [bid,count] of Object.entries(newCounts)) if (count > PLUS_LIMITS.employeesPerBranch && count > Number(oldCounts[bid] || 0)) return `وصلت خطة Plus إلى حد الموظفين للفرع (${PLUS_LIMITS.employeesPerBranch}).`;
    }
    if (canonical === 'cashtop_invoices') return grewPast(todayBranchCount(oldVal, branch), todayBranchCount(newVal, branch), PLUS_LIMITS.invoicesDailyPerBranch, 'فواتير البيع اليومية للفرع');
    if (canonical === 'cashtop_expenses') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.expensesDailyCompany, 'المصروفات اليومية للشركة');
    if (canonical === 'cashtop_customers') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.customersDailyCompany, 'العملاء الجدد يومياً للشركة');
    if (canonical === 'cashtop_purchases') return grewPast(todayCount(oldVal), todayCount(newVal), PLUS_LIMITS.purchasesDailyCompany, 'فواتير المشتريات اليومية للشركة');
    return '';
  }
  function countBranchProducts(products, branch) { return normalizeArrayValue(products, []).filter(p => productVisibleInBranch(p, branch)).length; }
  function employeeCounts(items) { const out={}; normalizeArrayValue(items, []).forEach(item => { const bid=String(item.branchId||'MAIN'); out[bid]=(out[bid]||0)+1; }); return out; }
  function todayCount(items) { return normalizeArrayValue(items, []).filter(isTodayRecord).length; }
  function todayBranchCount(items, branch) { return normalizeArrayValue(items, []).filter(item => sameBranch(item, branch) && isTodayRecord(item)).length; }

  function transformManagedRead(canonical, rawValue) {
    if (rawValue == null) return rawValue;
    if (canonical === 'cashtop_products') return projectProducts(safeJson(rawValue, []));
    if (BRANCH_SCOPED_ARRAY_KEYS.has(canonical)) return projectBranchArray(safeJson(rawValue, []));
    if (BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) return projectFunds(rawValue);
    return rawValue;
  }

  function transformManagedWrite(canonical, oldRaw, value) {
    if (canonical === 'cashtop_products') return mergeProducts(safeJson(oldRaw, []), safeJson(value, []));
    if (BRANCH_SCOPED_ARRAY_KEYS.has(canonical)) return mergeBranchArray(safeJson(oldRaw, []), safeJson(value, []));
    if (BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) return mergeFunds(oldRaw, value);
    return String(value);
  }

  function getRawCompanyDataset(key) {
    return rawGet(namespaceKey(canonicalKey(key)));
  }

  function patchStorage() {
    if (window.__CASHTOP_STORAGE_PATCHED__) return;
    window.__CASHTOP_STORAGE_PATCHED__ = true;

    Storage.prototype.getItem = function (key) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.get.call(this, key);
      const canonical = canonicalKey(key);
      return transformManagedRead(canonical, migrateLegacyValue(canonical));
    };

    Storage.prototype.setItem = function (key, value) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.set.call(this, key, value);
      const canonical = canonicalKey(key);
      const ns = namespaceKey(canonical);
      const oldValue = rawGet(ns);
      const stringValue = transformManagedWrite(canonical, oldValue, value);
      if (oldValue === stringValue) return;
      const violation = quotaViolation(canonical, oldValue, stringValue);
      if (violation) {
        showToast(violation, 'error', 5200);
        const error = new Error(violation); error.code = 'CASHTOP_PLAN_LIMIT'; throw error;
      }
      rawSet(ns, stringValue);
      const previousMeta = safeJson(rawGet(metaKey(canonical)), {}) || {};
      rawSet(metaKey(canonical), JSON.stringify({
        updatedAt: Date.now(), revision: Number(previousMeta.revision || 0) + 1,
        deviceId: getDeviceId(), page: FILE
      }));
      appendAudit(canonical, oldValue, stringValue);
      const operationId = enqueueSyncOperation(canonical);
      emitDataChange(canonical, oldValue, stringValue, 'local', operationId);
    };

    Storage.prototype.removeItem = function (key) {
      if (this !== localStorage || !isManagedKey(key)) return RAW.remove.call(this, key);
      const canonical = canonicalKey(key);
      const ns = namespaceKey(canonical);
      const oldValue = rawGet(ns);
      if (canonical === 'cashtop_products' || BRANCH_SCOPED_ARRAY_KEYS.has(canonical) || BRANCH_SCOPED_OBJECT_KEYS.has(canonical)) {
        this.setItem(canonical, canonical === 'cashtop_funds_db' ? JSON.stringify({accounts:[],accountLogs:[]}) : '[]');
        return;
      }
      rawRemove(ns); rawRemove(metaKey(canonical));
      appendAudit(canonical, oldValue, null, 'delete');
      const operationId = enqueueSyncOperation(canonical);
      emitDataChange(canonical, oldValue, null, 'local', operationId);
    };
  }

  function seedCompanyStorage() {
    DATA_KEYS.forEach(key => {
      const canonical = canonicalKey(key);
      const ns = namespaceKey(canonical);
      if (rawGet(ns) === null) {
        const value = Object.prototype.hasOwnProperty.call(NON_ARRAY_DEFAULTS, canonical)
          ? NON_ARRAY_DEFAULTS[canonical]
          : [];
        rawSet(ns, JSON.stringify(value));
        rawSet(metaKey(canonical), JSON.stringify({ updatedAt: 0, revision: 0, seeded: true }));
      }
    });
  }


  const DATA_RESET_VERSION = 'original-zero-embedded-v1';

  function resetCompanyDataOnce() {
    const companyId = companyIdFromSession();
    const marker = `ct_data_reset::${encodeURIComponent(companyId)}::${DATA_RESET_VERSION}`;
    if (rawGet(marker) === 'done') return;

    const canonicalKeys = Array.from(new Set(DATA_KEYS.map(canonicalKey)));
    canonicalKeys.forEach(key => {
      rawRemove(namespaceKey(key, companyId));
      rawRemove(metaKey(key, companyId));
      rawRemove(key);
      Object.keys(ALIASES).filter(alias => ALIASES[alias] === key).forEach(rawRemove);
    });

    // Clear old company namespaces from earlier builds for this company only.
    const encoded = encodeURIComponent(companyId);
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = RAW.key.call(localStorage, i);
      if (key && (key.startsWith(`cashtop_data::${encoded}::`) || key.startsWith(`cashtop_meta::${encoded}::`))) {
        toDelete.push(key);
      }
    }
    toDelete.forEach(rawRemove);
    rawSet(marker, 'done');
  }

  function bootstrapCompanyAccess() {
    const session = getSession() || {};
    const role = String(session.role || '').toLowerCase();
    if (!['admin', 'owner', 'company-admin'].includes(role)) return;

    const current = safeJson(localStorage.getItem('cashtop_company_access'), {}) || {};
    const licenses = safeJson(rawGet('cashtop_admin_licenses'), []) || [];
    const users = safeJson(rawGet('cashtop_admin_users'), []) || [];
    const companyKey = String(session.companyKey || current.companyKey || '').trim().toUpperCase();
    const license = licenses.find(item => String(item.key || '').trim().toUpperCase() === companyKey) || {};
    const localUser = users.find(item =>
      String(item.companyKey || '').trim().toUpperCase() === companyKey &&
      String(item.username || '').toLowerCase() === String(session.username || '').toLowerCase()
    ) || {};

    const manager = {
      ...(current.manager || {}),
      id: session.uid || localUser.id || current.manager?.id || `ADMIN_${Date.now()}`,
      username: session.username || localUser.username || current.manager?.username || 'admin',
      displayName: session.displayName || localUser.displayName || current.manager?.displayName || 'مدير الشركة',
      role: 'admin',
      active: localUser.active !== false && current.manager?.active !== false
    };
    // لا نستبدل كلمة مرور سحابية موجودة بقيمة فارغة.
    if (localUser.password) manager.password = localUser.password;

    const comparableCurrent = { ...current };
    delete comparableCurrent.updatedAt;
    const comparableNext = {
      ...comparableCurrent,
      companyKey: companyKey || current.companyKey || '',
      companyId: session.companyId || license.companyId || current.companyId || '',
      companyName: session.companyName || license.companyName || current.companyName || '',
      status: license.status || current.status || 'active',
      startAt: license.startAt || current.startAt || '',
      endAt: license.endAt || session.licenseEnd || current.endAt || '',
      manager
    };
    if (JSON.stringify(comparableCurrent) !== JSON.stringify(comparableNext)) {
      localStorage.setItem('cashtop_company_access', JSON.stringify({ ...comparableNext, updatedAt: Date.now() }));
    }
  }

  function validateSessionLocal(session) {
    if (!session) return { ok: false, reason: 'missing' };
    const companyId = session.companyId || session.companyKey || 'unassigned';
    const access = safeJson(rawGet(namespaceKey('cashtop_company_access', companyId)), {}) || {};
    if (access.status && access.status !== 'active') return { ok: false, reason: 'stopped' };
    if (access.deleted === true) return { ok: false, reason: 'deleted' };
    const accessEnd = access.endAt ? new Date(access.endAt).getTime() : 0;
    if (accessEnd && Number.isFinite(accessEnd) && Date.now() >= accessEnd) return { ok: false, reason: 'expired' };
    if (session.status && session.status !== 'active') return { ok: false, reason: 'stopped' };
    const end = session.licenseEnd ? new Date(session.licenseEnd).getTime() : null;
    if (end && Number.isFinite(end) && Date.now() >= end) return { ok: false, reason: 'expired' };

    session.companyName = access.companyName || session.companyName;
    session.status = access.status || session.status || 'active';
    session.licenseStart = access.startAt || session.licenseStart || '';
    session.licenseEnd = access.endAt || session.licenseEnd || '';
    session.plan = access.plan || session.plan || 'pro';
    session.entitlementVersion = access.authVersion || access.updatedAt || session.entitlementVersion || 0;

    const role = String(session.role || '').toLowerCase();
    if (role === 'employee' || String(session.uid || '').startsWith('EMP_')) {
      const employees = normalizeArrayValue(rawGet(namespaceKey('cashtop_employees', companyId)), []);
      const employee = employees.find(item => String(item.id) === String(session.uid)) ||
        employees.find(item => String(item.username || '').toLowerCase() === String(session.username || '').toLowerCase());
      if (!employee || employee.status !== 'active') return { ok: false, reason: 'user-disabled' };
      session.displayName = employee.name || session.displayName;
      session.permissions = normalizePermissions(employee.permissions || {});
      session.branchRecordId = employee.branchId || null;
      const branches = normalizeArrayValue(rawGet(namespaceKey('cashtop_branches', companyId)), []);
      const employeeBranch = branches.find(item => String(item.id) === String(employee.branchId));
      if (!employeeBranch || employeeBranch.status === 'مجمد') return { ok: false, reason: 'user-disabled' };
      session.branchId = employeeBranch.isMain === true ? 'MAIN' : employeeBranch.id;
      session.dataBranchId = session.branchId;
      session.branchName = employeeBranch.name || employee.branchName || '';
      session.authVersion = employee.authVersion || employee.updatedAt || 0;
    } else if (['branch-admin', 'branch_manager', 'manager'].includes(role)) {
      const branches = normalizeArrayValue(rawGet(namespaceKey('cashtop_branches', companyId)), []);
      const lookup = session.branchRecordId || session.branchId;
      const branch = branches.find(item => String(item.id) === String(lookup)) ||
        branches.find(item => String(item.managerUsername || '').toLowerCase() === String(session.username || '').toLowerCase());
      if (!branch || branch.status === 'مجمد' || branch.managerActive === false || !branch.managerUsername) return { ok: false, reason: 'user-disabled' };
      session.branchRecordId = branch.id;
      session.branchId = branch.isMain === true ? 'MAIN' : branch.id;
      session.dataBranchId = session.branchId;
      session.branchName = branch.name || session.branchName;
      session.displayName = branch.manager || session.displayName;
      session.permissions = normalizePermissions(branch.managerPermissions || {});
      session.authVersion = branch.managerAuthVersion || branch.updatedAt || 0;
    } else if (isCompanyAdminRole(role)) {
      if (access.manager && (access.manager.active === false || (session.username && access.manager.username && String(access.manager.username).toLowerCase() !== String(session.username).toLowerCase()))) {
        return { ok: false, reason: 'user-disabled' };
      }
      session.branchId = 'MAIN'; session.dataBranchId = 'MAIN';
      session.permissions = session.permissions || {};
    }
    rawSet('cashtop_session', JSON.stringify(session));
    return { ok: true, session };
  }

  function redirectToLogin(reason) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    const target = `صفحة تسجيل الدخول.html${params.toString() ? `?${params}` : ''}`;
    if (!location.pathname.endsWith(encodeURI('صفحة تسجيل الدخول.html'))) location.replace(target);
  }

  async function logout(reason) {
    try {
      if (window.CashtopFirebase && typeof window.CashtopFirebase.signOut === 'function') {
        await window.CashtopFirebase.signOut();
      }
    } catch (_) { /* local session is still cleared */ }
    const companyId = companyIdFromSession();
    try { sessionStorage.removeItem(`ct_firebase_state::${encodeURIComponent(companyId)}`); } catch (_) {}
    rawRemove('cashtop_session');
    redirectToLogin(reason || 'logout');
  }

  function ensureAuthenticated() {
    if (!IS_APP_PAGE) return true;
    const result = validateSessionLocal(getSession());
    if (!result.ok) {
      redirectToLogin(result.reason);
      return false;
    }
    return true;
  }

  function addCoreAssets() {
    document.documentElement.classList.add('ct-app-page', 'ct-shell-ready');
    if (!document.querySelector('link[href="cashtop-core.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'cashtop-core.css';
      document.head.appendChild(link);
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#605ca8';
    if (!theme.parentNode) document.head.appendChild(theme);
    let favicon = document.querySelector('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = 'icon-192.png';
    if (FILE === 'cashier.html') document.documentElement.classList.add('ct-cashier-page');
  }

  const PAGE_TITLES = {
    'لوحة التحكم.html': 'لوحة التحكم', 'cashier.html': 'نقطة البيع والكاشير',
    'products.html': 'المنتجات والمخزون', 'invoices.html': 'فواتير المبيعات',
    'المشتريات.html': 'فواتير المشتريات', 'مرجع المشتريات.html': 'مرتجع المشتريات',
    'customers.html': 'العملاء', 'customer-groups.html': 'مجموعات العملاء',
    'suppliers.html': 'الموردون', 'accounts.html': 'الحسابات والصناديق',
    'sands.html': 'سندات القبض والصرف', 'journal.html': 'دفتر القيود المحاسبية', 'المصاريف.html': 'المصاريف',
    'warehouses.html': 'المخازن', 'branches.html': 'الفروع', 'units.html': 'الوحدات',
    'shortages.html': 'نواقص المخزون', 'barcode-generator.html': 'مولد الباركود',
    'المناديب.html': 'المناديب', 'الموظفين.html': 'الموظفون',
    'العمال والاجور.html': 'العمال والأجور', 'التقارير.html': 'التقارير',
    'setting.html': 'إعدادات النظام', 'printer-settings.html': 'إعدادات الطابعة',
    'sales-offers.html': 'عروض المبيعات',
    'tax-settings.html': 'إعدادات الضريبة', 'notifications.html': 'الإشعارات',
    'storage-settings.html': 'إدارة التخزين والأرشفة',
    'ادارة التصنيع.html': 'إدارة التصنيع', 'استيراد وتصدير ل كل قسم.html': 'النسخ الاحتياطي والاستعادة'
  };

  function mountShell() {
    const body = document.body;
    if (!body) return;
    const host = document.getElementById('ctPageHost');
    const shell = document.querySelector('.ct-app-shell');
    if (!host || !shell) {
      console.error('[CASH TOP] الهيكل المدمج غير موجود داخل الصفحة:', FILE);
      return;
    }
    document.documentElement.classList.add('ct-shell-ready');
    hydrateShell();
  }

  function ensureBottomNavigation() {
    document.querySelectorAll('.ct-bottom-nav').forEach(nav => {
      nav.innerHTML = `
        <a href="لوحة التحكم.html"><i class="fa-solid fa-house"></i><span>الرئيسية</span></a>
        <a href="cashier.html"><i class="fa-solid fa-cash-register"></i><span>الكاشير</span></a>
        <a href="products.html"><i class="fa-solid fa-box-open"></i><span>المنتجات</span></a>
        <a href="customers.html"><i class="fa-solid fa-users"></i><span>العملاء</span></a>
        <a href="invoices.html"><i class="fa-solid fa-file-invoice"></i><span>الفواتير</span></a>`;
    });
  }

  function rebuildSidebarMenu() {
    const nav = document.querySelector('.ct-sidebar-nav');
    if (!nav) return;
    const backupLink = (section) => [`استيراد وتصدير ل كل قسم.html?section=${encodeURIComponent(section)}`, 'نسخ واستيراد القسم'];
    const groups = [
      ['fa-house','الرئيسية', [['لوحة التحكم.html','لوحة التحكم']]],
      ['fa-cash-register','المبيعات', [['cashier.html','الكاشير'],['invoices.html','فواتير المبيعات'],['sales-offers.html','عروض المبيعات'],backupLink('sales')]],
      ['fa-cart-shopping','المشتريات', [['المشتريات.html','فواتير المشتريات'],['مرجع المشتريات.html','مرتجع المشتريات'],['suppliers.html','الموردون'],backupLink('purchases')]],
      ['fa-boxes-stacked','المخزون والفروع', [['products.html','المنتجات'],['warehouses.html','المخازن'],['branches.html','الفروع'],['units.html','الوحدات'],['shortages.html','النواقص'],['barcode-generator.html','الباركود'],backupLink('inventory')]],
      ['fa-industry','التصنيع', [['ادارة التصنيع.html','إدارة التصنيع'],backupLink('manufacturing')]],
      ['fa-handshake','العملاء والعلاقات', [['customers.html','العملاء'],['customer-groups.html','مجموعات العملاء'],['المناديب.html','المناديب'],backupLink('relationships')]],
      ['fa-calculator','المالية والمحاسبة', [['accounts.html','الصناديق والحسابات'],['sands.html','سندات القبض والصرف'],['journal.html','دفتر القيود'],['المصاريف.html','المصاريف'],backupLink('finance')]],
      ['fa-users-gear','الموارد البشرية', [['الموظفين.html','الموظفون'],['العمال والاجور.html','العمال والأجور'],backupLink('hr')]],
      ['fa-chart-line','التقارير والمتابعة', [['التقارير.html','التقارير'],['notifications.html','الإشعارات'],backupLink('reports')]],
      ['fa-gears','النظام والإعدادات', [['tax-settings.html','إعدادات الضريبة'],['storage-settings.html','التخزين والأرشفة'],['استيراد وتصدير ل كل قسم.html','النسخ الاحتياطي الشامل'],['setting.html','إعدادات النظام'],['printer-settings.html','إعدادات الطابعة'],backupLink('settings')]]
    ];
    nav.innerHTML = groups.map(([icon,title,links], index) => {
      if (index === 0) return links.map(([href,label]) => `<a class="ct-menu-link" href="${href}"><i class="fa-solid ${icon}"></i><span>${label}</span></a>`).join('');
      return `<details class="ct-menu-group"><summary><i class="fa-solid ${icon}"></i><span>${title}</span><i class="fa-solid fa-chevron-down ct-menu-arrow"></i></summary><div class="ct-submenu">${links.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</div></details>`;
    }).join('');
    nav.querySelectorAll('.ct-menu-group').forEach(group => group.addEventListener('toggle', () => {
      if (!group.open) return;
      nav.querySelectorAll('.ct-menu-group[open]').forEach(other => { if (other !== group) other.open = false; });
    }));
  }

  function linkedPageInfo(link) {
    try {
      const url = new URL(link.getAttribute('href') || '', location.href);
      return {
        file: decodeURIComponent(url.pathname.split('/').pop() || ''),
        section: url.searchParams.get('section') || ''
      };
    } catch (_) {
      const href = decodeURIComponent((link.getAttribute('href') || '').split('/').pop() || '');
      const [file, query = ''] = href.split('?');
      return { file, section: new URLSearchParams(query).get('section') || '' };
    }
  }

  function normalizeShellLabels() {
    document.querySelectorAll('.ct-sidebar-logout, .ct-logout-top').forEach(button => button.remove());
    rebuildSidebarMenu();
  }

  function restrictSettingsForBasicUser(session) {
    if (FILE !== 'setting.html' || isCompanyAdminRole(session?.role) || can('settings.system', session)) return;
    const host = document.getElementById('ctPageHost');
    if (!host || host.dataset.logoutOnly === 'true') return;
    host.dataset.logoutOnly = 'true';
    host.innerHTML = `<div style="max-width:520px;margin:45px auto;background:#fff;border-top:4px solid #605ca8;border-radius:10px;padding:24px;text-align:center;box-shadow:0 8px 25px rgba(15,23,42,.08)"><i class="fa-solid fa-right-from-bracket" style="font-size:38px;color:#605ca8"></i><h2 style="font-size:18px;margin:14px 0 6px">إعدادات الحساب</h2><p style="font-size:12px;color:#64748b;line-height:1.8">لا يملك هذا الحساب صلاحية إعدادات النظام. الإجراء المتاح هو تسجيل الخروج فقط.</p><button type="button" data-ct-action="logout" style="border:0;background:#dd4b39;color:#fff;border-radius:7px;padding:11px 24px;font:700 13px Cairo;cursor:pointer"><i class="fa-solid fa-right-from-bracket"></i> تسجيل الخروج</button></div>`;
  }

  function firstAllowedPage(session = getSession()) {
    return Object.keys(PAGE_PERMISSIONS).find(file => can(PAGE_PERMISSIONS[file], session)) || 'setting.html';
  }

  function enforceCurrentPageAccess(session = getSession()) {
    if (FILE === 'setting.html') return true;
    const required = PAGE_PERMISSIONS[FILE];
    if (!required || can(required, session)) return true;
    const fallback = firstAllowedPage(session);
    if (fallback && fallback !== FILE) {
      location.replace(fallback);
      return false;
    }
    logout('permission-denied');
    return false;
  }

  function permissionAllowed(requirement, session = getSession()) {
    if (Array.isArray(requirement)) return requirement.some(permission => can(permission, session));
    return can(requirement, session);
  }

  function serializePermissionRequirement(requirement) {
    return Array.isArray(requirement) ? requirement.join(',') : String(requirement || '');
  }

  function readPermissionRequirement(element) {
    if (!element) return null;
    const any = element.dataset?.ctPermissionAny;
    if (any) return any.split(',').map(item => item.trim()).filter(Boolean);
    return element.dataset?.ctPermission || null;
  }

  function assignPermissionRequirement(element, requirement) {
    if (!element || !requirement) return;
    if (Array.isArray(requirement)) {
      element.dataset.ctPermissionAny = serializePermissionRequirement(requirement);
      delete element.dataset.ctPermission;
    } else {
      element.dataset.ctPermission = requirement;
      delete element.dataset.ctPermissionAny;
    }
  }

  function applyActionPermissions(root = document) {
    const map = ACTION_PERMISSION_MAP[FILE] || {};
    const candidates = [
      ...(root.matches?.('[onclick], [onsubmit], [onchange]') ? [root] : []),
      ...(root.querySelectorAll?.('[onclick], [onsubmit], [onchange]') || [])
    ];
    candidates.forEach(element => {
      const source = ['onclick', 'onsubmit', 'onchange']
        .map(attribute => element.getAttribute(attribute) || '')
        .join(' ');
      if (!source) return;
      for (const [handler, requirement] of Object.entries(map)) {
        if (source.includes(`${handler}(`)) {
          assignPermissionRequirement(element, requirement);
          break;
        }
      }
    });
    (ACTION_SELECTOR_RULES[FILE] || []).forEach(([selector, requirement]) => {
      try {
        const selected = [
          ...(root.matches?.(selector) ? [root] : []),
          ...(root.querySelectorAll?.(selector) || [])
        ];
        selected.forEach(element => assignPermissionRequirement(element, requirement));
      } catch (error) {
        console.warn('[CASH TOP] Invalid permission selector:', selector, error);
      }
    });
  }

  function guardRestrictedAction(event) {
    const target = event.target instanceof Element ? event.target : null;
    const restricted = target?.closest?.('[data-ct-permission], [data-ct-permission-any]');
    if (!restricted) return;
    const requirement = readPermissionRequirement(restricted);
    if (permissionAllowed(requirement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast('لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء.', 'error');
  }

  function applyPermissionVisibility(root = document) {
    const session = getSession() || {};
    root.querySelectorAll?.('.ct-sidebar a[href], .ct-bottom-nav a[href]').forEach(link => {
      const { file } = linkedPageInfo(link);
      const required = PAGE_PERMISSIONS[file];
      link.hidden = file === 'setting.html' ? false : Boolean(required && !can(required, session));
    });
    root.querySelectorAll?.('[data-ct-permission], [data-ct-permission-any]').forEach(element => {
      const allowed = permissionAllowed(readPermissionRequirement(element), session);
      element.hidden = !allowed;
      if ('disabled' in element) element.disabled = !allowed;
    });
    document.querySelectorAll('.ct-menu-group').forEach(group => {
      const visibleLinks = [...group.querySelectorAll('a[href]')].some(link => !link.hidden);
      group.hidden = !visibleLinks;
    });
  }

  function hydrateShell() {
    const session = getSession() || {};
    if (!enforceCurrentPageAccess(session)) return;
    ensureBottomNavigation();
    normalizeShellLabels();
    applyActionPermissions();
    applyPermissionVisibility();
    restrictSettingsForBasicUser(session);
    renderSubscriptionPanel(session);
    const pageTitle = PAGE_TITLES[FILE] || document.title || APP_NAME;
    document.title = `${pageTitle} - ${APP_NAME}`;
    setText('ctPageTitle', pageTitle);
    setText('ctCompanyTitle', session.companyName || 'نظام المحاسبة والمخزون');
    setText('ctSidebarCompany', session.companyName || session.companyKey || APP_NAME);
    setText('ctCurrentUser', session.displayName || session.username || 'مستخدم');

    const current = FILE;
    const currentSection = current === 'استيراد وتصدير ل كل قسم.html' ? (new URLSearchParams(location.search).get('section') || '') : '';
    document.querySelectorAll('.ct-sidebar a[href], .ct-bottom-nav a[href]').forEach(link => {
      const target = linkedPageInfo(link);
      const sectionMatches = current !== 'استيراد وتصدير ل كل قسم.html' || target.section === currentSection;
      if (target.file === current && sectionMatches) {
        link.classList.add('active');
        const details = link.closest('details');
        if (details) details.open = true;
      }
    });

    document.addEventListener('click', handleShellClick);
    document.addEventListener('click', guardRestrictedAction, true);
    document.addEventListener('submit', guardRestrictedAction, true);
    document.addEventListener('change', guardRestrictedAction, true);
    mountHeaderActions();
    upgradeShellIconsToSvg();
    enhanceAllSelects();
    updateNetworkStatus();
    updateNotificationBadge();
    displayLicenseWarning(session);
    compactCompletedData(false).catch(console.warn);
    let permissionRefreshFrame = 0;
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) applyActionPermissions(node);
      }));
      // Large product/customer tables may add hundreds of rows in one render.
      // Batch the expensive global permission/select pass into one animation frame.
      if (!permissionRefreshFrame) {
        permissionRefreshFrame = requestAnimationFrame(() => {
          permissionRefreshFrame = 0;
          enhanceAllSelects();
          applyPermissionVisibility();
        });
      }
    });
    observer.observe(document.getElementById('ctPageHost') || document.body, { childList: true, subtree: true });
    window.addEventListener('cashtop:data-changed', updateNotificationBadge);
  }


  function renderSubscriptionPanel(session = getSession()) {
    if (FILE !== 'setting.html' || document.getElementById('ctSubscriptionPanel')) return;
    const access = getCompanyAccess();
    const plan = String(access.plan || session?.plan || 'pro').toLowerCase();
    const host = document.getElementById('ctPageHost');
    if (!host) return;
    const panel = document.createElement('section');
    panel.id = 'ctSubscriptionPanel';
    panel.className = 'ct-subscription-panel';
    panel.innerHTML = `<style>.ct-subscription-panel{background:#fff;border:1px solid #e2e8f0;border-top:4px solid #605ca8;border-radius:9px;padding:15px;margin:0 0 16px;font-family:Cairo}.ct-plan-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.ct-plan-head strong{font-size:14px}.ct-plan-badge{padding:5px 12px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:800}.ct-plan-description{margin-top:10px;color:#64748b;font-size:11px;line-height:1.8}</style><div class="ct-plan-head"><strong><i class="fa-solid fa-crown"></i> خطة الشركة</strong><span class="ct-plan-badge">${plan === 'plus' ? 'Plus' : 'Pro'}</span></div><div class="ct-plan-description">تُدار الخطة مركزياً من لوحة المشرف، وتُحدّث على جميع الأجهزة من Firebase.</div>`;
    host.prepend(panel);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function handleShellClick(event) {
    const actionEl = event.target.closest('[data-ct-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.ctAction;
    if (action === 'open-sidebar') toggleSidebar(true);
    if (action === 'close-sidebar') toggleSidebar(false);
    if (action === 'logout') logout('logout');
    if (action === 'sync') {
      if (!can('sync.run')) return showToast('لا تملك صلاحية تشغيل المزامنة اليدوية.', 'error');
      syncNow();
    }
    if (action === 'install-app') installPwa();
  }

  function toggleSidebar(open) {
    document.getElementById('ctSidebar')?.classList.toggle('open', open);
    document.getElementById('ctSidebarOverlay')?.classList.toggle('open', open);
  }

  function updateNetworkStatus() {
    const status = document.getElementById('ctNetStatus');
    if (!status) return;
    const online = navigator.onLine;
    status.classList.toggle('offline', !online);
    const span = status.querySelector('span');
    if (span) span.textContent = online ? 'متصل' : 'غير متصل';
    status.title = online ? 'متصل بالإنترنت' : 'يتم الحفظ محلياً وسيتم التزامن لاحقاً';
    updateSyncBadge();
  }

  function displayLicenseWarning(session) {
    if (!session || !session.licenseEnd) return;
    const remaining = new Date(session.licenseEnd).getTime() - Date.now();
    const days = Math.ceil(remaining / 86400000);
    if (days > 7 || days < 0) return;
    const banner = document.createElement('div');
    banner.className = 'ct-license-banner';
    banner.textContent = 'تنبيه: راجع حالة الاشتراك من الإعدادات.';
    document.body.appendChild(banner);
  }

  function showToast(message, type = 'info', duration = 3200) {
    let wrap = document.querySelector('.ct-core-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ct-core-toast-wrap';
      document.body.appendChild(wrap);
    }
    const toast = document.createElement('div');
    toast.className = `ct-core-toast ${type}`;
    toast.textContent = message;
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  async function installPwa() {
    if (!can('app.install')) {
      showToast('لا تملك صلاحية تثبيت التطبيق.', 'error');
      return { installed: false, denied: true };
    }
    if (appInstalled || window.matchMedia?.('(display-mode: standalone)')?.matches) {
      showToast('التطبيق مثبت بالفعل على هذا الجهاز.', 'success');
      return { installed: true, alreadyInstalled: true };
    }
    if (!deferredInstallPrompt) {
      showToast('نافذة التثبيت غير متاحة الآن. افتح الموقع عبر Chrome ثم اختر «تثبيت التطبيق» من قائمة المتصفح.', 'info', 5200);
      return { installed: false, unavailable: true };
    }
    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') showToast('تم بدء تثبيت التطبيق.', 'success');
    else showToast('تم إلغاء تثبيت التطبيق.', 'info');
    return { installed: choice?.outcome === 'accepted', outcome: choice?.outcome || 'dismissed' };
  }

  async function syncNow(options = {}) {
    const manual = options.manual !== false;
    if (manual && !can('sync.run')) {
      showToast('لا تملك صلاحية تشغيل المزامنة اليدوية.', 'error');
      return { processed: 0, denied: true };
    }
    const button = document.getElementById('ctSyncButton');
    const animationStartedAt = performance.now();
    const finishAnimation = (minimumMs = 900) => {
      if (!manual) return;
      const elapsed = performance.now() - animationStartedAt;
      window.setTimeout(() => button?.classList.remove('ct-syncing'), Math.max(0, minimumMs - elapsed));
    };
    if (manual) button?.classList.add('ct-syncing');
    window.dispatchEvent(new CustomEvent('cashtop:sync-request', { detail: { manual } }));
    if (!navigator.onLine) {
      if (manual) showToast('لا يوجد اتصال. تم الحفظ محلياً وستتم المزامنة تلقائياً عند عودة الإنترنت.', 'warning');
      finishAnimation(800);
      updateSyncBadge();
      return { processed: 0, offline: true };
    }
    try {
      if (window.CashtopFirebase && typeof window.CashtopFirebase.syncAll === 'function') {
        const result = await window.CashtopFirebase.syncAll({ manual, forceCheck: true });
        if (manual) {
          if (Number(result?.processed || 0) > 0 || Number(result?.pulled || 0) > 0) {
            showToast('تمت المزامنة', 'success');
          } else {
            showToast('لا توجد عمليات معلقة؛ البيانات متزامنة.', 'success');
          }
        }
        return result;
      }
      if (manual) showToast('البيانات محفوظة محلياً. تعذر تحميل وحدة المزامنة السحابية حالياً.', 'info');
      return { processed: 0, unavailable: true };
    } catch (error) {
      console.error(error);
      if (manual) showToast(error?.message || 'تعذرت المزامنة الآن، وستتم إعادة المحاولة تلقائياً.', 'error');
      return { processed: 0, error: true };
    } finally {
      updateSyncBadge();
      finishAnimation(1050);
    }
  }

  function getAllCompanyData() {
    const session = getSession() || {};
    const datasets = {};
    DATA_KEYS.forEach(key => {
      const rawValue = getRawCompanyDataset(key);
      datasets[key] = {
        exists: rawValue !== null,
        value: rawValue,
        valueEncoding: 'local-storage-raw-v1'
      };
    });
    return {
      format: 'cashtop-backup-v3',
      exportedAt: new Date().toISOString(),
      companyId: session.companyId || session.companyKey,
      companyName: session.companyName,
      datasets
    };
  }

  function exportBackup() {
    const backup = getAllCompanyData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CASH_TOP_${backup.companyName || backup.companyId || 'company'}_${new Date().toISOString().slice(0, 10)}.backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم إنشاء النسخة الاحتياطية بنجاح.', 'success');
  }

  function isBackupImportEnabled() {
    const access = getCompanyAccess();
    return access?.backupImportEnabled === true;
  }

  async function syncImportedData() {
    if (window.CashtopFirebase?.syncAll) {
      try { await window.CashtopFirebase.syncAll({ manual: false, forceCheck: true }); }
      catch (error) { console.warn('[CASH TOP] restore sync:', error); }
    }
  }

  async function importBackupFile(file) {
    if (!isBackupImportEnabled()) throw new Error('استيراد النسخ مقفل لهذا المفتاح. افتحه من لوحة المشرف أولاً.');
    const text = await file.text();
    const backup = safeJson(text, null);
    if (!backup || !['cashtop-backup-v2', 'cashtop-backup-v3'].includes(backup.format) || !backup.datasets) throw new Error('صيغة النسخة الاحتياطية غير صحيحة');
    const session = getSession() || {};
    const currentCompany = String(session.companyId || session.companyKey || '');
    if (backup.companyId && currentCompany && String(backup.companyId) !== currentCompany) {
      throw new Error('هذه النسخة تخص شركة أخرى ولا يمكن دمجها داخل الشركة الحالية');
    }
    // التخزين المحلي أولاً؛ اعتراض localStorage ينشئ العمليات المعلقة لكل قسم.
    Object.entries(backup.datasets).forEach(([key, entry]) => {
      if (!isManagedKey(key)) return;
      const exactRaw = entry && typeof entry === 'object' && entry.valueEncoding === 'local-storage-raw-v1';
      if (exactRaw && entry.exists === false) {
        localStorage.removeItem(key);
        return;
      }
      const storageValue = exactRaw
        ? String(entry.value ?? '')
        : (typeof entry === 'string' && ['cashtop_sms_template', 'cashtop_invoice_message_template'].includes(canonicalKey(key))
          ? entry
          : JSON.stringify(entry));
      localStorage.setItem(key, storageValue);
    });
    showToast('تمت الاستعادة محلياً، وتجري المزامنة الآن.', 'success');
    await syncImportedData();
    setTimeout(() => location.reload(), 500);
  }

  function applyRemoteDataset(key, value, meta) {
    const canonical = canonicalKey(key);
    const ns = namespaceKey(canonical);
    suppressEvents = true;
    try {
      rawSet(ns, typeof value === 'string' ? value : JSON.stringify(value));
      rawSet(metaKey(canonical), JSON.stringify(meta || { updatedAt: Date.now(), source: 'remote' }));
    } finally {
      suppressEvents = false;
    }
    dispatchLogicalStorageEvents(canonical, null, typeof value === 'string' ? value : JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('cashtop:remote-applied', { detail: { key: canonical } }));
  }


  function normalizeDateValue(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function getTaxSettings() {
    return Object.assign({
      enabled: false, salesRate: 0, purchaseRate: 0,
      salesBearer: 'customer', purchaseBearer: 'business', pricesIncludeTax: false
    }, safeJson(localStorage.getItem('cashtop_tax_settings'), {}) || {});
  }

  function calculateTax(amount, kind = 'sales') {
    const cfg = getTaxSettings();
    const base = Math.max(0, Number(amount) || 0);
    const rate = Math.max(0, Number(kind === 'purchase' ? cfg.purchaseRate : cfg.salesRate) || 0);
    const enabled = Boolean(cfg.enabled && rate > 0);
    const bearer = kind === 'purchase' ? cfg.purchaseBearer : cfg.salesBearer;
    const charged = kind === 'sales' ? bearer === 'customer' : bearer === 'business';
    if (!enabled) return { enabled: false, rate, tax: 0, bearer, charged: false, included: false, total: base };
    const included = Boolean(cfg.pricesIncludeTax);
    const tax = included ? base * rate / (100 + rate) : base * rate / 100;
    const total = included ? base : base + (charged ? tax : 0);
    return { enabled, rate, tax, bearer, charged, included, total };
  }

  function getSmartNotifications() {
    const cfg = Object.assign({ lowStockThreshold: 5, debtOverdueDays: 30, inactiveCustomerDays: 45, enabled: true },
      safeJson(localStorage.getItem('cashtop_notification_settings'), {}) || {});
    if (cfg.enabled === false) return [];
    const now = Date.now();
    const day = 86400000;
    const products = normalizeArrayValue(localStorage.getItem('cashtop_products'), []);
    const customers = normalizeArrayValue(localStorage.getItem('cashtop_customers'), []);
    const invoices = normalizeArrayValue(localStorage.getItem('cashtop_invoices'), []);
    const out = [];

    products.forEach(product => {
      const stock = Number(product.stockPieces ?? product.stock ?? 0) || 0;
      if (stock <= Number(cfg.lowStockThreshold || 0)) {
        out.push({
          id: `stock_${product.id}`, type: 'stock', severity: stock <= 0 ? 'danger' : 'warning',
          title: stock <= 0 ? 'نفاد مخزون' : 'مخزون منخفض',
          message: `${product.name || 'منتج'}: المتوفر ${stock} ${product.pieceName || 'قطعة'}`,
          href: 'products.html', date: now
        });
      }

      const expiryWarningDays = Math.max(1, Number(cfg.expiryWarningDays || 30));
      const lots = normalizeArrayValue(product.inventoryLots || [], []);
      lots.forEach(lot => {
        const remaining = Math.max(0, Number(lot.remainingPieces ?? lot.quantityPieces ?? 0));
        const expiryTime = normalizeDateValue(lot.expiryDate);
        if (!remaining || !expiryTime) return;
        const daysLeft = Math.ceil((expiryTime - now) / day);
        if (daysLeft < 0) {
          out.push({
            id: `expired_${product.id}_${lot.id || lot.expiryDate}`, type: 'expiry', severity: 'danger',
            title: 'منتج منتهي الصلاحية',
            message: `${product.name || 'منتج'}: كمية ${remaining} انتهت بتاريخ ${lot.expiryDate}`,
            href: 'notifications.html', date: expiryTime, productId: product.id, lotId: lot.id || ''
          });
        } else if (daysLeft <= expiryWarningDays) {
          out.push({
            id: `expiring_${product.id}_${lot.id || lot.expiryDate}`, type: 'expiry', severity: 'warning',
            title: 'منتج أوشك على انتهاء الصلاحية',
            message: `${product.name || 'منتج'}: كمية ${remaining} تنتهي خلال ${daysLeft} يوم`,
            href: 'notifications.html', date: expiryTime, productId: product.id, lotId: lot.id || ''
          });
        }
      });
    });

    customers.forEach(customer => {
      const balance = Number(customer.balance || 0);
      const customerInvoices = invoices.filter(inv => inv.status !== 'draft' &&
        (String(inv.customerId || '') === String(customer.id || '') || inv.customer === customer.name));
      const lastInvoice = customerInvoices.slice().sort((a, b) => normalizeDateValue(b.date) - normalizeDateValue(a.date))[0];
      const oldestDebt = customerInvoices.filter(inv => Number(inv.debt || 0) > 0)
        .sort((a, b) => normalizeDateValue(a.date) - normalizeDateValue(b.date))[0];
      if (balance > 0 && oldestDebt && now - normalizeDateValue(oldestDebt.date) >= Number(cfg.debtOverdueDays || 30) * day) {
        out.push({
          id: `debt_${customer.id}`, type: 'debt', severity: 'danger', title: 'تأخر في سداد الدين',
          message: `${customer.name}: رصيد مستحق ${balance.toFixed(2)} ₪ منذ أكثر من ${cfg.debtOverdueDays} يوماً`,
          href: 'customers.html', date: normalizeDateValue(oldestDebt.date)
        });
      }
      const lastDate = normalizeDateValue(lastInvoice?.date || customer.lastPurchaseAt || customer.lastPurchaseDate || customer.createdAt);
      if (lastDate && now - lastDate >= Number(cfg.inactiveCustomerDays || 45) * day) {
        out.push({
          id: `inactive_${customer.id}`, type: 'inactive', severity: 'info', title: 'عميل لم يشترِ منذ فترة',
          message: `${customer.name}: لم تُسجل له عملية شراء منذ ${Math.floor((now - lastDate) / day)} يوماً`,
          href: 'customers.html', date: lastDate
        });
      }
    });

    const employees = normalizeArrayValue(localStorage.getItem('cashtop_employees'), []);
    const salaryPayments = normalizeArrayValue(localStorage.getItem('cashtop_salary_payments'), []);
    const today = new Date();
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    employees.filter(employee => employee.status === 'active' && Number(employee.salary || 0) > 0).forEach(employee => {
      const salaryDay = Math.min(31, Math.max(1, Number(employee.salaryDay || 1)));
      const dueDate = new Date(today.getFullYear(), today.getMonth(), salaryDay);
      const startDate = employee.salaryStartDate ? new Date(`${employee.salaryStartDate}T00:00:00`) : null;
      const startedBeforeThisDueDate = !startDate || !Number.isFinite(startDate.getTime()) || startDate <= dueDate;
      const alreadyPaid = salaryPayments.some(payment => String(payment.employeeId) === String(employee.id) && payment.salaryMonth === monthKey && payment.status !== 'reversed');
      if (today >= dueDate && startedBeforeThisDueDate && !alreadyPaid) {
        out.push({
          id: `salary_${employee.id}_${monthKey}`, type: 'salary', severity: 'warning', title: 'راتب موظف مستحق',
          message: `${employee.name || 'موظف'}: راتب ${Number(employee.salary).toFixed(3).replace(/\.?0+$/, '')} ₪ مستحق للصرف`,
          href: 'notifications.html', date: now, employeeId: employee.id, salaryMonth: monthKey,
          amount: Number(employee.salary), accountId: employee.salaryAccountId || ''
        });
      }
    });
    return out.sort((a, b) => (a.severity === 'danger' ? -1 : 0) - (b.severity === 'danger' ? -1 : 0));
  }

  function mountHeaderActions() {
    const actions = document.querySelector('.ct-topbar-actions');
    if (!actions || actions.querySelector('.ct-notification-button')) return;
    const quick = document.createElement('div');
    quick.className = 'ct-quick-actions';
    quick.innerHTML = `
      <a href="customers.html" class="ct-quick-button"><i class="fa-solid fa-user-plus"></i><span>إضافة عميل</span></a>
      <a href="cashier.html" class="ct-quick-button"><i class="fa-solid fa-file-invoice"></i><span>فاتورة</span></a>
      <a href="invoices.html" class="ct-quick-button"><i class="fa-solid fa-file-lines"></i><span>الفواتير</span></a>`;
    actions.insertBefore(quick, actions.firstChild);
    const bell = document.createElement('a');
    bell.href = 'notifications.html';
    bell.className = 'ct-icon-button ct-notification-button';
    bell.title = 'الإشعارات';
    bell.innerHTML = '<i class="fa-solid fa-bell"></i><span class="ct-icon-badge" id="ctNotificationBadge">0</span>';
    const sync = document.getElementById('ctSyncButton');
    if (sync && !sync.querySelector('#ctSyncBadge')) {
      const syncBadge = document.createElement('span');
      syncBadge.className = 'ct-sync-badge';
      syncBadge.id = 'ctSyncBadge';
      sync.appendChild(syncBadge);
    }
    if (sync) sync.insertAdjacentElement('afterend', bell);
    else actions.insertBefore(bell, actions.firstChild);
    updateNotificationBadge();
    updateSyncBadge();
  }

  function updateNotificationBadge() {
    const badge = document.getElementById('ctNotificationBadge');
    if (!badge) return;
    const count = getSmartNotifications().length;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  }

  function injectSvgSprite() {
    if (document.getElementById('ctSvgSprite')) return;
    const wrap = document.createElement('div');
    wrap.id = 'ctSvgSprite';
    wrap.hidden = true;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <symbol id="cti-home" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
      <symbol id="cti-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
      <symbol id="cti-box" viewBox="0 0 24 24"><path d="m4 7 8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
      <symbol id="cti-users" viewBox="0 0 24 24"><path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6M2 21v-3c0-3 2.5-5 6-5s6 2 6 5v3m2-8c3.2.2 6 2 6 5v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>
      <symbol id="cti-receipt" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>
      <symbol id="cti-wallet" viewBox="0 0 24 24"><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h12M16 11h5v4h-5a2 2 0 0 1 0-4Z" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
      <symbol id="cti-settings" viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.2 13.4c.1-.5.1-1 0-1.5l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.3-.8L15.2 4h-4l-.4 2.6c-.5.2-.9.5-1.3.8l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 1.5l-2 1.5 2 3.5 2.4-1c.4.3.8.6 1.3.8l.4 2.6h4l.4-2.6c.5-.2.9-.5 1.3-.8l2.4 1 2-3.5-2.1-1.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
      <symbol id="cti-cash" viewBox="0 0 24 24"><path d="M3 7h18v12H3zM7 11h4v4H7zm8 1h3M5 4h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
      <symbol id="cti-chevron" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
      <symbol id="cti-sync" viewBox="0 0 24 24"><path d="M7.2 18.5h10.3a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.4 8.4 5.1 5.1 0 0 0 7.2 18.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m9 12 3-3 3 3m-3-3v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      <symbol id="cti-bell" viewBox="0 0 24 24"><path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
      <symbol id="cti-user" viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM3 22a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
      <symbol id="cti-logout" viewBox="0 0 24 24"><path d="M10 4H4v16h6M14 8l4 4-4 4m4-4H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    </svg>`;
    document.body.appendChild(wrap);
  }

  function upgradeShellIconsToSvg() {
    injectSvgSprite();
    const map = {
      'fa-house':'home','fa-bars':'menu','fa-boxes-stacked':'box','fa-box-open':'box','fa-cubes':'box',
      'fa-file-invoice-dollar':'receipt','fa-file-invoice':'receipt','fa-file-lines':'receipt',
      'fa-users':'users','fa-users-gear':'users','fa-user-plus':'users','fa-wallet':'wallet',
      'fa-sliders':'settings','fa-cash-register':'cash','fa-chevron-down':'chevron',
      'fa-rotate':'sync','fa-bell':'bell','fa-user-shield':'user','fa-right-from-bracket':'logout'
    };
    document.querySelectorAll('.ct-sidebar i, .ct-topbar i, .ct-bottom-nav i').forEach(icon => {
      const cls = [...icon.classList].find(c => map[c]);
      if (!cls) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('ct-svg-icon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#cti-${map[cls]}`);
      svg.appendChild(use);
      icon.replaceWith(svg);
    });
  }

  function openArchiveDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('cashtop-archive-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'archiveKey' });
          store.createIndex('companyDataset', 'companyDataset', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function archiveRecords(dataset, records) {
    if (!records?.length || !('indexedDB' in window)) return 0;
    const db = await openArchiveDb();
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    const companyId = companyIdFromSession();
    records.forEach((record, index) => {
      const id = record.id || record.refId || `${normalizeDateValue(record.date)}_${index}`;
      store.put({
        archiveKey: `${companyId}::${dataset}::${id}`,
        companyDataset: `${companyId}::${dataset}`,
        companyId, dataset, id, date: normalizeDateValue(record.date || record.createdAt || record.updatedAt),
        record, archivedAt: Date.now()
      });
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
    return records.length;
  }

  async function readArchivedRecords(dataset) {
    if (!('indexedDB' in window)) return [];
    const db = await openArchiveDb();
    const tx = db.transaction('records', 'readonly');
    const index = tx.objectStore('records').index('companyDataset');
    const request = index.getAll(`${companyIdFromSession()}::${dataset}`);
    const rows = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.map(row => row.record);
  }

  async function compactCompletedData(force = false) {
    const indexData = safeJson(localStorage.getItem('cashtop_archive_index'), {}) || {};
    const last = Number(indexData.lastCompactionAt || 0);
    if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return { skipped: true };
    const settings = Object.assign({ invoiceLimit: 1200, historyLimit: 1500, completedAgeDays: 365 },
      safeJson(localStorage.getItem('cashtop_settings'), {})?.storage || {});
    const ageDays = Math.max(7, Number(settings.completedAgeDays || 365));
    const cutoff = Date.now() - ageDays * 86400000;
    const policies = [
      ['cashtop_invoices', Math.max(100, Number(settings.invoiceLimit || 1200)), item => item.status !== 'draft'],
      ['cashtop_purchases', Math.max(100, Number(settings.invoiceLimit || 1200)), () => true],
      ['cashtop_transfer_history', Math.max(100, Number(settings.historyLimit || 1500)), () => true],
      ['cashtop_branch_transfer_history', Math.max(100, Number(settings.historyLimit || 1500)), () => true],
      ['cashtop_manufacturing_orders', Math.max(100, Number(settings.historyLimit || 1500)), item => item.status === 'completed' || !item.status]
    ];
    const archivedCounts = Object.assign({}, indexData.archivedCounts || {});
    const runCounts = {};
    for (const [key, limit, completed] of policies) {
      const list = safeJson(localStorage.getItem(key), []) || [];
      if (!Array.isArray(list) || !list.length) continue;
      const sortedCompleted = list.filter(completed).slice().sort((a, b) => normalizeDateValue(a.date || a.createdAt) - normalizeDateValue(b.date || b.createdAt));
      const candidates = [];
      const selected = new Set();
      sortedCompleted.forEach(item => {
        const time = normalizeDateValue(item.date || item.createdAt || item.updatedAt);
        if (time > 0 && time < cutoff) { candidates.push(item); selected.add(item); }
      });
      const projectedLength = list.length - candidates.length;
      const overflow = Math.max(0, projectedLength - limit);
      if (overflow) {
        sortedCompleted.filter(item => !selected.has(item)).slice(0, overflow).forEach(item => {
          candidates.push(item); selected.add(item);
        });
      }
      if (!candidates.length) continue;
      await archiveRecords(key, candidates);
      const kept = list.filter(item => !selected.has(item));
      localStorage.setItem(key, JSON.stringify(kept));
      archivedCounts[key] = Number(archivedCounts[key] || 0) + candidates.length;
      runCounts[key] = candidates.length;
    }
    const audit = safeJson(localStorage.getItem('cashtop_audit_log'), []) || [];
    if (audit.length > 1200) localStorage.setItem('cashtop_audit_log', JSON.stringify(audit.slice(-1200)));
    const result = { lastCompactionAt: Date.now(), archivedCounts, lastRunCounts: runCounts };
    localStorage.setItem('cashtop_archive_index', JSON.stringify(result));
    return result;
  }

  let ctActiveSelect = null;
  let ctSelectPopover = null;
  let ctSelectBackdrop = null;

  function closeModernSelect(restoreFocus = false) {
    const select = ctActiveSelect;
    ctSelectPopover?.remove();
    ctSelectBackdrop?.remove();
    // WebView may discard a JS reference while leaving the fixed backdrop in DOM.
    // Remove any orphaned select layer so it can never block the page controls.
    document.querySelectorAll('.ct-select-popover, .ct-select-backdrop').forEach(element => element.remove());
    ctSelectPopover = null;
    ctSelectBackdrop = null;
    ctActiveSelect = null;
    document.querySelectorAll('.ct-select-is-open').forEach(element => element.classList.remove('ct-select-is-open'));
    if (restoreFocus && select && document.contains(select)) {
      try { select.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function closeTransientUi(options = {}) {
    closeModernSelect(false);
    if (options.closeSidebar !== false) toggleSidebar(false);
    document.documentElement.classList.remove('ct-ui-locked');
    document.body?.classList.remove('ct-ui-locked');
  }

  function selectBoundaryPosition(popover, select) {
    if (!popover || !select || window.matchMedia('(max-width: 600px)').matches) return;
    const rect = select.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(220, Math.min(420, rect.width));
    popover.style.width = `${width}px`;
    const measuredHeight = Math.min(popover.scrollHeight, 420);
    let top = rect.bottom + 6;
    if (top + measuredHeight > window.innerHeight - margin && rect.top > measuredHeight + margin) {
      top = rect.top - measuredHeight - 6;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - measuredHeight - margin));
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function dispatchSelectChange(select) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openModernSelect(select) {
    if (!select || select.disabled || select.dataset.nativeSelect === 'true') return;
    if (ctActiveSelect === select) { closeModernSelect(true); return; }
    closeModernSelect(false);
    ctActiveSelect = select;
    select.classList.add('ct-select-is-open');

    const backdrop = document.createElement('div');
    backdrop.className = 'ct-select-backdrop';
    backdrop.addEventListener('pointerdown', event => { event.preventDefault(); closeModernSelect(true); });

    const popover = document.createElement('div');
    popover.className = 'ct-select-popover';
    popover.setAttribute('role', 'listbox');
    popover.setAttribute('aria-multiselectable', select.multiple ? 'true' : 'false');
    popover.addEventListener('pointerdown', event => event.stopPropagation());

    const optionsHost = document.createElement('div');
    optionsHost.className = 'ct-select-options';
    const optionCount = [...select.options].filter(option => !option.hidden).length;
    let searchInput = null;

    if (optionCount > 8) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ct-select-search-wrap';
      searchInput = document.createElement('input');
      searchInput.className = 'ct-select-search';
      searchInput.type = 'search';
      searchInput.placeholder = 'ابحث داخل القائمة...';
      searchInput.autocomplete = 'off';
      searchWrap.appendChild(searchInput);
      popover.appendChild(searchWrap);
    }

    function renderOptions(query = '') {
      const normalized = String(query || '').trim().toLocaleLowerCase('ar');
      optionsHost.innerHTML = '';
      let visible = 0;
      let lastGroup = null;
      [...select.options].forEach((option, index) => {
        if (option.hidden) return;
        const label = (option.textContent || '').trim();
        if (normalized && !label.toLocaleLowerCase('ar').includes(normalized)) return;
        const group = option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : '';
        if (group && group !== lastGroup) {
          const groupEl = document.createElement('div');
          groupEl.className = 'ct-select-group';
          groupEl.textContent = group;
          optionsHost.appendChild(groupEl);
          lastGroup = group;
        } else if (!group) {
          lastGroup = null;
        }
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `ct-select-option${option.selected ? ' is-selected' : ''}`;
        row.disabled = option.disabled;
        row.dataset.optionIndex = String(index);
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', option.selected ? 'true' : 'false');
        const text = document.createElement('span');
        text.textContent = label || '—';
        const check = document.createElement('span');
        check.className = 'ct-select-check';
        check.textContent = option.selected ? '✓' : '';
        row.append(text, check);
        row.addEventListener('click', () => {
          if (option.disabled) return;
          if (select.multiple) {
            option.selected = !option.selected;
            dispatchSelectChange(select);
            renderOptions(searchInput?.value || '');
          } else {
            select.selectedIndex = index;
            closeModernSelect(false);
            dispatchSelectChange(select);
            select.focus({ preventScroll: true });
          }
        });
        optionsHost.appendChild(row);
        visible += 1;
      });
      if (!visible) {
        const empty = document.createElement('div');
        empty.className = 'ct-select-empty';
        empty.textContent = 'لا توجد خيارات مطابقة';
        optionsHost.appendChild(empty);
      }
    }

    renderOptions();
    popover.appendChild(optionsHost);
    if (select.multiple) {
      const footer = document.createElement('div');
      footer.className = 'ct-select-footer';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'ct-select-done';
      done.textContent = 'تم';
      done.addEventListener('click', () => closeModernSelect(true));
      footer.appendChild(done);
      popover.appendChild(footer);
    }
    searchInput?.addEventListener('input', () => renderOptions(searchInput.value));

    document.body.append(backdrop, popover);
    ctSelectBackdrop = backdrop;
    ctSelectPopover = popover;
    selectBoundaryPosition(popover, select);
    requestAnimationFrame(() => searchInput?.focus({ preventScroll: true }));
  }

  function enhanceAllSelects() {
    document.querySelectorAll('select:not([data-ct-enhanced])').forEach(select => {
      select.dataset.ctEnhanced = 'true';
      select.style.touchAction = 'pan-y';
      let gesture = null;
      let ignoreClickUntil = 0;
      select.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.pointerType === 'mouse') event.preventDefault();
        gesture = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startedAt: performance.now(),
          moved: false
        };
      });
      select.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 9) gesture.moved = true;
      }, { passive: true });
      select.addEventListener('pointercancel', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        gesture = null;
        ignoreClickUntil = performance.now() + 650;
      });
      select.addEventListener('pointerup', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const current = gesture;
        gesture = null;
        ignoreClickUntil = performance.now() + 650;
        const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
        const intentionalTap = !current.moved && distance <= 9 && (performance.now() - current.startedAt) < 900;
        if (!intentionalTap) return;
        event.preventDefault();
        event.stopPropagation();
        openModernSelect(select);
      });
      select.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (performance.now() < ignoreClickUntil) return;
        openModernSelect(select);
      });
      select.addEventListener('keydown', event => {
        if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          openModernSelect(select);
        } else if (event.key === 'Escape') {
          closeModernSelect(true);
        }
      });
    });
    if (!document.documentElement.dataset.ctSelectEvents) {
      document.documentElement.dataset.ctSelectEvents = 'true';
      window.addEventListener('resize', () => selectBoundaryPosition(ctSelectPopover, ctActiveSelect));
      window.addEventListener('scroll', () => selectBoundaryPosition(ctSelectPopover, ctActiveSelect), true);
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && ctActiveSelect) closeModernSelect(true);
      });
    }
  }

  window.Cashtop = Object.assign(window.Cashtop || {}, {
    FILE,
    DATA_KEYS: [...DATA_KEYS],
    aliases: { ...ALIASES },
    getSession,
    logout,
    showToast,
    syncNow,
    installPwa,
    can,
    normalizePermissions,
    PERMISSION_GROUPS,
    PAGE_PERMISSIONS,
    ACTION_PERMISSION_MAP,
    applyActionPermissions,
    applyPermissionVisibility,
    toggleSidebar,
    closeTransientUi,
    rawGet,
    rawSet,
    getRawCompanyDataset,
    branchIdFromSession,
    currentPlan,
    PLUS_LIMITS,
    namespaceKey,
    metaKey,
    safeJson,
    normalizeArray: normalizeArrayValue,
    getAllCompanyData,
    exportBackup,
    importBackupFile,
    isBackupImportEnabled,
    syncImportedData,
    applyRemoteDataset,
    validateSessionLocal,
    getTaxSettings, calculateTax, getSmartNotifications, updateNotificationBadge,
    archiveRecords, readArchivedRecords, compactCompletedData,
    getSyncQueue, enqueueSyncOperation, completeSyncOperation, clearSyncQueue, updateSyncBadge
  });

  if (IS_APP_PAGE) {
    addCoreAssets();
    patchStorage();
    if (ensureAuthenticated()) { seedCompanyStorage(); bootstrapCompanyAccess(); }

    window.addEventListener('online', () => { updateNetworkStatus(); syncNow({ manual: false }); });
    window.addEventListener('cashtop:sync-queue-changed', updateSyncBadge);
    window.addEventListener('offline', updateNetworkStatus);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeTransientUi();
    });
    window.addEventListener('pageshow', () => closeTransientUi(), { passive: true });
    document.addEventListener('DOMContentLoaded', mountShell, { once: true });

    const refreshSessionAccess = () => {
      const before = getSession() || {};
      const result = validateSessionLocal(before);
      if (!result.ok) { logout(result.reason); return; }
      const after = getSession() || {};
      if (JSON.stringify(before.permissions || {}) !== JSON.stringify(after.permissions || {}) || before.authVersion !== after.authVersion || before.plan !== after.plan) {
        applyPermissionVisibility();
        applyActionPermissions();
        if (!enforceCurrentPageAccess(after)) return;
        window.dispatchEvent(new CustomEvent('cashtop:session-updated', { detail: after }));
      }
    };
    setInterval(refreshSessionAccess, 4000);
    window.addEventListener('cashtop:remote-applied', event => {
      if (['cashtop_employees','cashtop_branches','cashtop_company_access'].includes(event.detail?.key)) refreshSessionAccess();
    });

    if (channel) {
      channel.addEventListener('message', event => {
        const data = event.data || {};
        if (data.type === 'license-change') {
          const result = validateSessionLocal(getSession());
          if (!result.ok) logout(result.reason);
        }
        if (data.type === 'data-change' && data.deviceId !== getDeviceId() && data.companyId === companyIdFromSession()) {
          dispatchLogicalStorageEvents(data.key, data.oldValue, data.value);
          window.dispatchEvent(new CustomEvent('cashtop:external-change', { detail: data }));
        }
      });
    }

    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => false);
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
          registration.active?.postMessage({ type: 'WARM_CACHE' });
        } catch (err) {
          console.warn('[CASH TOP 2] SW:', err);
        }
      });
    }
  }
})();

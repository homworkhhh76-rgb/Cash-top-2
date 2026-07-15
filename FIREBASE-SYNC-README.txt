إعداد مزامنة Firebase — كاش توب 2 / Revision 26

المسار الرسمي الوحيد لكل شركة:
- cashTopExchange/cashTopPOS/{tenantId}

قواعد العزل في Revision 26:
1. tenantId هو هوية الشركة الثابتة والدائمة، بينما companyKey مفتاح دخول فقط.
2. كل مفتاح تنشئه لوحة المشرف يرتبط بـ tenantId مستقل، ولا يمكن توجيهه إلى عقدة شركة أخرى.
3. لا يقوم تسجيل الدخول بفحص جذر الشركات كاملاً أو اختيار أحدث عقدة؛ يعتمد فهرس الإدارة، أو مسار tenantId محلي معروف مسبقاً فقط.
4. أي اختلاف بين tenantId للمسار وtenantId داخل meta/cashtop_company_access يوقف الدخول والمزامنة فوراً.
5. لا تستخدم المزامنة أي عقدة قديمة تحمل معرفاً مختلفاً؛ الجذور القديمة تقبل فقط نفس tenantId.
6. التخزين المحلي وطابور المزامنة والأرشيف مفصولة حسب tenantId.
7. جلسة كل تبويب مثبتة في sessionStorage لمنع انتقال تبويب مفتوح إلى شركة أخرى إذا تم تسجيل الدخول بمفتاح مختلف في تبويب ثانٍ.
8. المفاتيح المحذوفة أو المستبدلة تُحجز في retiredKeys ولا يعاد استخدامها لشركة جديدة.
9. يجب نشر قواعد Realtime Database المرفقة حتى يتم التحقق من تطابق هوية عقدة الشركة مع اسم المسار.

إعداد مزامنة Firebase — كاش توب 2 / Revision 18

المسار الرسمي الوحيد لكل شركة:
- cashTopExchange/cashTopPOS/{companyId}

إصلاحات Revision 18:
1. طلبات Firebase لا تمر عبر Cache Storage ولا يمكن أن تعيد نسخة قديمة.
2. companyId هو هوية المسار الثابتة؛ companyKey وlicenseId يستخدمان فقط للتحقق من مسار تاريخي مطابق.
3. فتح/قفل استيراد النسخ الاحتياطية لا يفعّل المزامنة ولا يوقفها؛ المزامنة تعمل دائماً عندما يكون Firebase مفعلاً.
4. لوحة المشرف تحدّث بيانات الاشتراك وحدها ولا تستبدل datasets الخاصة بالشركة.
5. يجب نشر قواعد Realtime Database المناسبة أو تفعيل Anonymous Authentication عند استخدام القواعد الآمنة.

إعداد مزامنة Firebase — كاش توب 2 / Revision 8

مشروع Realtime Database المستخدم:
- projectId: meopp-8f1fa
- databaseURL: https://meopp-8f1fa-default-rtdb.firebaseio.com
- المسار التاريخي: cashTopExchange/cashTopPOS/{companyId}
- مسار التوافق مع Revision 7: cashTopPOS/v6/{companyId}

طريقة الاتصال الجديدة:
1. يجرب التطبيق Realtime Database مباشرة أولاً.
2. لذلك لا يستدعي Firebase Authentication عندما تسمح قواعد قاعدة البيانات بالوصول،
   ولا يظهر خطأ CONFIGURATION_NOT_FOUND.
3. إذا رفضت القواعد الوصول، يحاول التطبيق Anonymous Authentication فقط عند الحاجة.
4. يفحص companyId وcompanyKey والمسارين أعلاه، ثم يختار المسار الذي يحتوي البيانات فعلياً.

ملفات القواعد:
- database.rules.json: قواعد آمنة تتطلب auth != null، وهي دمج لقواعد كاش توب القديمة ونقطة الشحن.
- database-rules-merge-snippet.json: مقطع لدمجه داخل القواعد الموجودة دون حذف مسارات تطبيق وطن أو نقطة الشحن.
- database.rules.compatibility.json: قواعد توافق خاصة بمسارات كاش توب فقط، تستخدم عندما تكون Authentication غير مهيأة حالياً.

مهم:
- لا يمكن لملفات HTML نشر قواعد Firebase أو تفعيل Authentication من داخل التطبيق.
- إذا كانت قاعدة البيانات الحالية تسمح بالوصول للمسار القديم، تعمل المزامنة مباشرة دون أي تعديل.
- إذا ظهرت رسالة رفض صلاحيات، فعّل Anonymous Authentication ثم انشر database.rules.json،
  أو انشر قواعد التوافق بعد مراجعة أثر السماح بالوصول إلى مسارات كاش توب.
- لا تستبدل قواعد المشروع كاملة إذا كانت هناك تطبيقات أخرى؛ ادمج المسارات فقط.

Revision 9:
- cashtop_branches يتضمن مديري الفروع وأسماء الدخول وكلمات المرور وأعلام الفرع الرئيسي.
- cashtop_employees يتضمن الفرع المرتبط بكل موظف وكلمة مروره وصلاحياته.
- cashtop_products يتضمن branchStocks وأرصدة المقاسات لكل فرع.
- cashtop_branch_transfer_history يتضمن سجل النقل بين الفروع.
- cashtop_company_access يتضمن بيانات دخول مدير الشركة المتزامنة.
- cashtop_printer_settings يتضمن إعدادات 58/80 مم والشعار وعدد النسخ والطابعة الافتراضية.

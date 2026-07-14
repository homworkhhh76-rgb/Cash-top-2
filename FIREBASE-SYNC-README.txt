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

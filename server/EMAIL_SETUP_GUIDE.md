# دليل إعداد البريد الإلكتروني (Email Setup Guide)

## المشكلة
Gmail يتطلب الآن تسجيل الدخول عبر المتصفح أو استخدام "App Password" (كلمة مرور التطبيق) لإرسال البريد الإلكتروني.

## الحل

### الخطوة 1: إنشاء App Password من Gmail

1. اذهب إلى [Google Account Security](https://myaccount.google.com/security)
2. قم بتفعيل "2-Step Verification" إذا لم يكن مفعلاً
3. اذهب إلى [App Passwords](https://myaccount.google.com/apppasswords)
4. اختر "Mail" و "Other (Custom name)"
5. أدخل اسم التطبيق (مثل "Linker Server")
6. انسخ كلمة المرور المولدة (16 حرف بدون مسافات)

### الخطوة 2: إعداد متغيرات البيئة

1. أنشئ ملف `.env` في مجلد `server/` (إذا لم يكن موجوداً)
2. أضف المتغيرات التالية:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=rami@linker.land
SMTP_PASS=your-16-character-app-password-here
```

**ملاحظة مهمة:** استبدل `your-16-character-app-password-here` بـ App Password الذي حصلت عليه من Gmail.

### الخطوة 3: إعادة تشغيل السيرفر

بعد إضافة المتغيرات، أعد تشغيل السيرفر:

```bash
npm run dev
```

## بدائل أخرى

### استخدام OAuth2 (أكثر أماناً)

إذا كنت تريد استخدام OAuth2 بدلاً من App Password، يمكنك استخدام مكتبة `nodemailer` مع OAuth2. هذا يتطلب إعداد إضافي في Google Cloud Console.

### استخدام مزود بريد آخر

يمكنك استخدام مزودي بريد آخر مثل:
- SendGrid
- Mailgun
- Amazon SES
- Mailchimp Transactional

## استكشاف الأخطاء

### خطأ: "534-5.7.9 Please log in with your web browser"

**الحل:**
1. تأكد من أنك تستخدم App Password وليس كلمة المرور العادية
2. تأكد من تفعيل 2-Step Verification
3. تأكد من أن App Password صحيح (16 حرف بدون مسافات)

### خطأ: "EAUTH"

**الحل:**
1. تحقق من أن `SMTP_USER` و `SMTP_PASS` في ملف `.env` صحيحة
2. تأكد من أن App Password لم تنته صلاحيته
3. جرب إنشاء App Password جديد

## الأمان

⚠️ **مهم جداً:**
- لا تضع App Password في الكود مباشرة
- استخدم دائماً متغيرات البيئة (`.env`)
- تأكد من أن ملف `.env` موجود في `.gitignore`
- لا تشارك App Password مع أي شخص




















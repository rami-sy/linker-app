# دليل الأمان - Linker

## 🔒 إجراءات الأمان المطبقة

### 1. **Environment Variables**
- ✅ نقل جميع API keys إلى متغيرات البيئة
- ✅ إنشاء ملفات `.env.example` للتوثيق
- ✅ إضافة `.env` إلى `.gitignore`
- ⚠️ أي قيمة تبدأ بـ `EXPO_PUBLIC_` تعتبر عامة وقابلة للاستخراج من bundle
- ⚠️ فعّل `ALLOW_DEV_OTP=true` محلياً فقط عند الحاجة، ولا تفعّله في production
- ⚠️ دوّر `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` إذا تم كشفه وقيّده بالـ domains وbundle IDs

### 2. **Rate Limiting**
- ✅ Rate limiting عام للتطبيق (100 طلب/15 دقيقة في production، 1000 في development)
- ✅ Rate limiting للمكالمات (10 مكالمات/15 دقيقة) — `/api/calls`, `/api/call-schedules`
- ✅ Rate limiting للمصادقة (30 محاولة/15 دقيقة) — يشمل OAuth وvalidate email
- ✅ Rate limiting لإعادة تعيين كلمة المرور (3 محاولات/ساعة)
- ✅ Rate limiting للرسائل (30 رسالة/دقيقة)

### 3. **Input Validation**
- ✅ تحقق من صحة بيانات المكالمات
- ✅ تحقق من صحة Room IDs
- ✅ تحقق من صحة User IDs
- ✅ تحقق من صحة MediaSoup parameters

### 4. **CORS Security**
- ✅ تقييد CORS للمواقع المسموح بها فقط
- ✅ دعم credentials للـ cookies
- ✅ تحديد headers المسموح بها

### 5. **Security Headers**
- ✅ استخدام Helmet للأمان
- ✅ Content Security Policy
- ✅ حماية من XSS attacks
- ✅ حماية من clickjacking

---

## 🚨 متطلبات النشر (Production)

### 1. **Environment Variables المطلوبة**

```bash
# Server Configuration
NODE_ENV=production
PORT=4000

# Database
MONGODB_URI=mongodb://username:password@host:port/database
REDIS_URL=redis://username:password@host:port

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-change-this
JWT_EXPIRES_IN=7d

# API Keys
VONAGE_API_KEY=your-vonage-api-key
VONAGE_API_SECRET=your-vonage-api-secret
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CALL_RATE_LIMIT_MAX=10
CALL_RATE_LIMIT_WINDOW_MS=900000
ALLOW_DEV_OTP=false
MEDIASOUP_WORKERS=
UPLOAD_MAX_FILE_SIZE_MB=100
```

### 2. **SSL/TLS Configuration**

```javascript
// في app.js - تفعيل HTTPS
const Server = https.createServer({
  key: fs.readFileSync('./ssl/private.key'),
  cert: fs.readFileSync('./ssl/certificate.crt'),
  ca: fs.readFileSync('./ssl/ca_bundle.crt')
}, app);
```

### 3. **Database Security**

```javascript
// MongoDB connection string مع SSL
const mongoUri = `mongodb+srv://${username}:${password}@${cluster}.mongodb.net/${database}?retryWrites=true&w=majority&ssl=true`;
```

### 4. **Redis Security**

```javascript
// Redis مع SSL و authentication
const redisClient = redis.createClient({
  url: `rediss://${username}:${password}@${host}:${port}`,
  tls: {
    rejectUnauthorized: true
  }
});
```

---

## 🛡️ إجراءات أمان إضافية

### 1. **JWT Security**
```javascript
// JWT configuration آمن
const jwtConfig = {
  secret: process.env.JWT_SECRET, // مفتاح قوي ومعقد
  expiresIn: '7d', // انتهاء صلاحية معقول
  algorithm: 'HS256', // خوارزمية آمنة
  issuer: 'linker-app', // مُصدر الـ token
  audience: 'linker-users' // جمهور الـ token
};
```

### 2. **Password Security**
```javascript
// كلمة مرور قوية
const passwordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128
};
```

### 3. **API Security**
```javascript
// Rate limiting متقدم
const advancedRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // لا نحسب الطلبات الناجحة
  skipFailedRequests: false // نحسب الطلبات الفاشلة
};
```

---

## 🔍 مراقبة الأمان

### 1. **Security Monitoring**
```javascript
// مراقبة محاولات الاختراق
const securityLogger = {
  logFailedAuth: (ip, userAgent, email) => {
    console.warn(`🚨 Failed auth attempt from ${ip}: ${email}`);
  },
  logRateLimitExceeded: (ip, endpoint) => {
    console.warn(`🚨 Rate limit exceeded from ${ip} on ${endpoint}`);
  },
  logSuspiciousActivity: (ip, activity) => {
    console.warn(`🚨 Suspicious activity from ${ip}: ${activity}`);
  }
};
```

### 2. **Error Handling**
```javascript
// معالجة آمنة للأخطاء
const secureErrorHandler = (error, req, res, next) => {
  // لا نكشف تفاصيل حساسة
  const safeError = {
    message: 'An error occurred',
    type: 'error',
    timestamp: new Date().toISOString()
  };
  
  // تسجيل الخطأ للتحليل
  console.error('Error:', error);
  
  res.status(500).json(safeError);
};
```

---

## 📋 Checklist الأمان

### **قبل النشر:**
- [ ] تغيير جميع API keys الافتراضية
- [ ] استخدام JWT secret قوي ومعقد
- [ ] تفعيل HTTPS في الإنتاج
- [ ] تكوين CORS للمواقع المسموح بها فقط
- [ ] تفعيل Rate limiting
- [ ] اختبار جميع endpoints
- [ ] مراجعة logs للأخطاء
- [ ] اختبار اختراق أساسي

### **بعد النشر:**
- [ ] مراقبة logs بانتظام
- [ ] تحديث dependencies
- [ ] مراجعة Rate limiting
- [ ] مراقبة محاولات الاختراق
- [ ] نسخ احتياطية منتظمة
- [ ] تحديث SSL certificates

---

## 🚨 استجابة للحوادث الأمنية

### 1. **في حالة تسريب API Key:**
```bash
# 1. إيقاف الخدمة فوراً
pm2 stop linker

# 2. تغيير API key في الخدمة
# 3. تحديث متغيرات البيئة
# 4. إعادة تشغيل الخدمة
pm2 start linker
```

### 2. **في حالة هجوم DDoS:**
```bash
# 1. تفعيل CloudFlare protection
# 2. تقليل Rate limits مؤقتاً
# 3. مراقبة logs
# 4. حجب IPs المشبوهة
```

### 3. **في حالة تسريب بيانات:**
```bash
# 1. إيقاف الخدمة
# 2. تغيير جميع كلمات المرور
# 3. إعادة تشفير البيانات
# 4. إشعار المستخدمين
```

---

## 📞 جهات الاتصال للأمان

- **Security Team:** security@linker.land
- **Emergency:** +1-XXX-XXX-XXXX
- **Bug Bounty:** security@linker.land

---

**آخر تحديث:** ديسمبر 2024  
**الإصدار:** 1.0  
**المسؤول:** فريق الأمان - Linker

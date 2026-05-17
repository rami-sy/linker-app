# حل مشكلة "Requested device not found" في MediaSoup

## المشكلة
```
NotFoundError: Requested device not found
```

هذا الخطأ يحدث عند محاولة الوصول إلى الكاميرا/الميكروفون على المتصفح.

---

## الأسباب المحتملة

### 1. عدم وجود أجهزة متصلة
- **الحل:** تأكد من توصيل كاميرا وميكروفون بالجهاز
- **التحقق:** 
  ```javascript
  // في console المتصفح
  navigator.mediaDevices.enumerateDevices().then(devices => {
    console.log(devices);
  });
  ```

### 2. الأذونات محجوبة
- **الحل:** امنح الأذونات في إعدادات المتصفح
- **Chrome:** Settings → Privacy and security → Site settings → Camera/Microphone
- **Firefox:** Settings → Privacy & Security → Permissions
- **Safari:** Safari → Settings for This Website → Camera/Microphone

### 3. الموقع غير آمن (HTTP)
- **المشكلة:** معظم المتصفحات تمنع الوصول للكاميرا/الميكروفون على HTTP
- **الحل:** 
  - استخدم HTTPS
  - أو استخدم localhost للتطوير (معظم المتصفحات تسمح به)
  - استخدم ngrok للحصول على HTTPS في التطوير

### 4. الأجهزة قيد الاستخدام
- **الحل:** أغلق التطبيقات الأخرى التي تستخدم الكاميرا/الميكروفون
- **أمثلة:** Zoom, Teams, Skype, OBS

### 5. المتصفح لا يدعم WebRTC
- **الحل:** استخدم متصفح حديث:
  - Chrome/Edge (مستحسن)
  - Firefox
  - Safari 11+

---

## الحلول التي تم تطبيقها

### 1. فحص الأجهزة قبل الطلب
```javascript
// الآن نتحقق من وجود أجهزة قبل getUserMedia
const devices = await navigator.mediaDevices.enumerateDevices();
const hasAudio = devices.some(device => device.kind === 'audioinput');
const hasVideo = devices.some(device => device.kind === 'videoinput');
```

### 2. رسائل خطأ واضحة
- **NotFoundError:** لا توجد كاميرا/ميكروفون
- **NotAllowedError:** الأذونات مرفوضة
- **NotReadableError:** الجهاز قيد الاستخدام
- **NotSupportedError:** المتصفح لا يدعم WebRTC

### 3. Fallback للصوت فقط
إذا لم تتوفر كاميرا، يتم التراجع إلى مكالمة صوتية فقط.

### 4. Constraints محسنة
```javascript
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

---

## خطوات التشخيص

### 1. افتح Developer Console
- **Chrome/Firefox:** F12 أو Ctrl+Shift+I
- **Safari:** Cmd+Option+I

### 2. تحقق من الأجهزة المتاحة
```javascript
navigator.mediaDevices.enumerateDevices().then(devices => {
  devices.forEach(device => {
    console.log(device.kind, device.label, device.deviceId);
  });
});
```

### 3. اختبر getUserMedia مباشرة
```javascript
navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  .then(stream => {
    console.log('✅ Success!', stream);
    // أوقف المسار بعد الاختبار
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(error => {
    console.error('❌ Error:', error.name, error.message);
  });
```

### 4. تحقق من الأذونات
```javascript
navigator.permissions.query({ name: 'camera' }).then(result => {
  console.log('Camera permission:', result.state);
});

navigator.permissions.query({ name: 'microphone' }).then(result => {
  console.log('Microphone permission:', result.state);
});
```

---

## للتطوير: استخدام HTTPS

### Option 1: ngrok
```bash
# في terminal منفصل
ngrok http 8081

# استخدم URL الذي يوفره ngrok
```

### Option 2: mkcert (Self-signed certificate)
```bash
# تثبيت mkcert
npm install -g mkcert

# إنشاء شهادة محلية
mkcert localhost 127.0.0.1 ::1

# تحديث metro.config.js أو webpack config
```

### Option 3: Expo Dev Client
```bash
# استخدم expo-dev-client الذي يدعم HTTPS
npx expo start --https
```

---

## للإنتاج

### 1. استخدم HTTPS دائماً
- احصل على شهادة SSL من Let's Encrypt (مجاناً)
- استخدم Cloudflare (SSL مجاني)

### 2. أضف تنبيهات واضحة للمستخدم
```javascript
if (mediaError) {
  return (
    <Alert>
      {mediaError}
      <Link to="/help/camera-permissions">تعليمات منح الأذونات</Link>
    </Alert>
  );
}
```

### 3. وفر بدائل
- مكالمات صوتية فقط
- رسائل نصية كبديل
- تعليمات خطوة بخطوة

---

## الاختبار

### اختبر على متصفحات مختلفة:
- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari (iOS/macOS)
- ✅ Mobile browsers

### اختبر سيناريوهات مختلفة:
- ✅ بدون كاميرا/ميكروفون
- ✅ أذونات مرفوضة
- ✅ أجهزة قيد الاستخدام
- ✅ HTTP vs HTTPS

---

## روابط مفيدة

- [MDN: getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [WebRTC Samples](https://webrtc.github.io/samples/)
- [Can I Use: getUserMedia](https://caniuse.com/stream)
- [MediaSoup Documentation](https://mediasoup.org/documentation/v3/)

---

## ملاحظات إضافية

### للمطورين:
1. استخدم localhost أو HTTPS دائماً في التطوير
2. اختبر على أجهزة حقيقية وليس المحاكيات فقط
3. وفر رسائل خطأ واضحة بلغة المستخدم

### للمستخدمين النهائيين:
سيتم عرض رسائل توضيحية تلقائياً عند حدوث أخطاء، مع روابط للمساعدة.


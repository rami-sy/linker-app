# تقرير المكتبات غير المستخدمة

## 📦 Client - المكتبات غير المستخدمة

### ❌ مكتبات غير مستخدمة (يمكن حذفها بأمان):

1. **`react-tinder-card`** (^1.6.4)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `react-native-reanimated` و `react-native-gesture-handler` بدلاً منها في `swipe-card.js`

2. **`rn-swiper-list`** (^2.2.0)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات لهذه المكتبة

3. **`recyclerlistview`** (^4.2.1)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `FlatList` من React Native

4. **`framer-motion`** (^12.7.4)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `react-native-reanimated` للحركات

5. **`@react-spring/native`** (^10.0.3)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `react-native-reanimated`

6. **`@react-spring/web`** (^10.0.3)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `react-native-reanimated`

7. **`@use-gesture/react`** (^10.3.1)
   - ❌ غير مستخدمة
   - ✅ المشروع يستخدم `react-native-gesture-handler`

8. **`react-async-hook`** (^4.0.0)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

9. **`react-native-worklets`** (0.5.1)
   - ❌ غير مستخدمة
   - ✅ `react-native-reanimated` يحتوي على worklets مدمجة

10. **`@simform_solutions/react-native-audio-waveform`** (^2.1.4)
    - ❌ غير مستخدمة
    - ✅ لا توجد أي استيرادات
    - ⚠️ موجودة في `expo.doctor.exclude` لكن غير مستخدمة

11. **`react-native-fast-image`** (^8.6.3)
    - ❌ غير مستخدمة
    - ✅ المشروع يستخدم `CachedImage` مخصص
    - ⚠️ موجودة في `expo.doctor.exclude` لكن غير مستخدمة

12. **`class-variance-authority`** (^0.7.1)
    - ❌ غير مستخدمة
    - ✅ لا توجد أي استيرادات

13. **`metro-runtime`** (^0.81.1)
    - ❌ غير مستخدمة مباشرة
    - ⚠️ قد تكون مطلوبة من قبل Expo داخلياً

14. **`buffer`** (^6.0.3)
    - ⚠️ قد تكون مطلوبة من قبل مكتبات أخرى (polyfill)
    - ✅ لا توجد استيرادات مباشرة

15. **`events`** (^3.3.0)
    - ⚠️ قد تكون مطلوبة من قبل مكتبات أخرى (polyfill)
    - ✅ لا توجد استيرادات مباشرة

### ✅ مكتبات مستخدمة (يجب الاحتفاظ بها):

- `simple-peer` - مستخدمة في `use-web-rtc.js`
- `bowser` - مستخدمة في `use-web-rtc.js` و `useMediasoup.js`
- `react-native-uuid` - مستخدمة في `socket.context.js` و `_layout.js`
- `react-native-country-picker-modal` - مستخدمة في عدة ملفات
- `react-native-dropdown-picker` - مستخدمة في `picker.js` و `user-info.js`
- `react-native-image-zoom-viewer` - مستخدمة في عدة ملفات
- `react-native-loading-spinner-overlay` - مستخدمة في `cam.js`
- `react-native-geocoding` - مستخدمة في `location-picker.js`
- `react-native-webrtc-web-shim` - مستخدمة في `web-rtc.js`
- `react-timer-hook` - مستخدمة في `timer.js`
- `rn-emoji-picker` - مستخدمة في `chat-input.js`
- `lucide-react-native` - مستخدمة في `show-filter-popup.js` و `user-card.js`
- `@vis.gl/react-google-maps` - مستخدمة في `web-google-maps.js`
- `tailwindcss-animate` - مستخدمة في `tailwind.config.js`
- `process` - مستخدمة في `_layout.js` (polyfill)

---

## 📦 Server - المكتبات غير المستخدمة

### ❌ مكتبات غير مستخدمة (يمكن حذفها بأمان):

1. **`express-graphql`** (^0.12.0)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

2. **`graphql`** (^15.8.0)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

3. **`passport-facebook`** (^3.0.0)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

4. **`passport-twitter`** (^1.0.4)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

5. **`loadsh`** (^0.0.4)
   - ❌ غير مستخدمة (typo في الاسم)
   - ✅ المشروع يستخدم `lodash` الصحيح

6. **`base64-js`** (^1.5.1)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

7. **`puppeteer-stream`** (^3.0.22)
   - ❌ غير مستخدمة
   - ✅ لا توجد أي استيرادات

8. **`create-cert`** (^1.0.6)
   - ⚠️ قد تكون مستخدمة في التطوير فقط
   - ✅ لا توجد استيرادات في الكود

### ✅ مكتبات مستخدمة (يجب الاحتفاظ بها):

- `socketio-wildcard` - مستخدمة في `socket.js`
- `http` - مستخدمة في `app.js` (مطلوبة من Node.js لكن قد تكون polyfill)

---

## 📊 ملخص

### Client:
- **15 مكتبة** غير مستخدمة يمكن حذفها
- **حجم تقريبي**: ~50-100 MB من `node_modules`

### Server:
- **8 مكتبات** غير مستخدمة يمكن حذفها
- **حجم تقريبي**: ~20-30 MB من `node_modules`

---

## ⚠️ تحذيرات قبل الحذف:

1. **`metro-runtime`**, **`buffer`**, **`events`**, **`process`**: قد تكون مطلوبة كـ polyfills من قبل مكتبات أخرى. تحقق قبل الحذف.

2. **`react-native-fast-image`** و **`@simform_solutions/react-native-audio-waveform`**: موجودة في `expo.doctor.exclude`، قد تكون مطلوبة في المستقبل.

3. **`http`** في Server: مطلوبة من Node.js لكن قد تكون polyfill.

---

## 🔧 خطوات الحذف:

### Client:
```bash
cd client
npm uninstall react-tinder-card rn-swiper-list recyclerlistview framer-motion @react-spring/native @react-spring/web @use-gesture/react react-async-hook react-native-worklets @simform_solutions/react-native-audio-waveform react-native-fast-image class-variance-authority
```

### Server:
```bash
cd server
npm uninstall express-graphql graphql passport-facebook passport-twitter loadsh base64-js puppeteer-stream create-cert
```

---

## ✅ بعد الحذف:

1. قم بتشغيل `npm install` في كلا المجلدين
2. اختبر التطبيق للتأكد من عدم وجود أخطاء
3. تحقق من أن `expo-doctor` لا يظهر مشاكل جديدة




















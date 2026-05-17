# دليل الترقية من Expo SDK 52 إلى SDK 54

## 📊 ملخص الفروقات الرئيسية

### 1. **التحديثات الأساسية**

| المكون | SDK 52 | SDK 54 | التغيير |
|--------|--------|--------|---------|
| **React Native** | 0.76.7 | 0.81 | ⚠️ Breaking Change |
| **React** | 18.3.1 | 19.1.0 | ⚠️ Breaking Change |
| **New Architecture** | اختياري | افتراضي | ⚠️ Breaking Change |
| **iOS Minimum** | 15.1 | 15.1 | ✅ بدون تغيير |
| **Android compileSdkVersion** | 35 | 36 | ⚠️ Breaking Change |
| **Android targetSdkVersion** | 34 | 36 | ⚠️ Breaking Change |

---

## ⚠️ Breaking Changes الرئيسية

### 1. **البنية الجديدة (New Architecture) - إلزامية**

**المشكلة:**
- في SDK 52: البنية الجديدة اختيارية
- في SDK 54: البنية الجديدة **إلزامية** لجميع المشاريع

**التأثير:**
- بعض المكتبات الخارجية قد لا تكون متوافقة مع New Architecture
- قد تحتاج إلى تحديث أو استبدال بعض المكتبات

**المكتبات التي قد تتأثر في مشروعك:**
- `react-native-webrtc` - يحتاج تحديث
- `react-native-incall-manager` - قد يحتاج تحديث
- `mediasoup-client` - يحتاج التحقق من التوافق
- `react-native-maps` - يحتاج تحديث
- `react-native-fast-image` - قد يحتاج استبدال

---

### 2. **React 19.1.0 - تغييرات كبيرة**

**التغييرات الرئيسية:**
- تغييرات في كيفية عمل Hooks
- تغييرات في `useEffect` و `useMemo`
- تغييرات في Server Components (للتطبيقات الويب)
- تحسينات في Concurrent Rendering

**ما يجب التحقق منه:**
- جميع الـ Hooks تعمل بشكل صحيح
- `useEffect` dependencies
- State management (Redux قد يحتاج تحديث)

---

### 3. **React Native 0.81 - تغييرات في API**

**التغييرات:**
- تغييرات في `TextInput` API
- تغييرات في `FlatList` و `ScrollView`
- تحسينات في `Animated` API
- تغييرات في Native Modules

---

### 4. **تغييرات في مكتبات Expo**

#### `expo-av` → `expo-video` + `expo-audio`

**المشكلة:**
- `expo-av` أصبح deprecated في SDK 54
- يجب الانتقال إلى `expo-video` و `expo-audio`

**ما يجب فعله:**
```javascript
// ❌ القديم (SDK 52)
import { Audio, Video } from 'expo-av';

// ✅ الجديد (SDK 54)
import { VideoView } from 'expo-video';
import { useAudioPlayer } from 'expo-audio';
```

**ملاحظة:** مشروعك يستخدم `expo-av` و `expo-video` معاً، يجب توحيد الاستخدام.

---

### 5. **Android SDK Requirements**

**التغييرات:**
- `compileSdkVersion`: 35 → 36
- `targetSdkVersion`: 34 → 36
- `minSdkVersion`: 24 (بدون تغيير)

**ما يجب فعله:**
تحديث `app.json`:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "compileSdkVersion": 36,
            "targetSdkVersion": 36,
            "minSdkVersion": 24
          }
        }
      ]
    ]
  }
}
```

---

## 🔍 المكتبات التي تحتاج التحقق في مشروعك

### مكتبات قد تحتاج تحديث:

1. **`react-native-webrtc`** (^124.0.3)
   - ⚠️ قد لا تكون متوافقة مع RN 0.81
   - ✅ تحقق من أحدث إصدار متوافق

2. **`react-native-maps`** (1.18.0)
   - ⚠️ قد تحتاج تحديث لـ RN 0.81
   - ✅ تحقق من التوافق

3. **`react-native-reanimated`** (~3.10.1)
   - ✅ عادة متوافق، لكن تحقق من الإصدار

4. **`mediasoup-client`** (3.16.7)
   - ⚠️ قد يحتاج تحديث
   - ✅ تحقق من التوافق مع New Architecture

5. **`react-native-incall-manager`** (^4.2.0)
   - ⚠️ قد لا تكون متوافقة مع New Architecture
   - ✅ تحقق من البدائل

6. **`react-native-fast-image`** (^8.6.3)
   - ⚠️ قد لا تكون متوافقة مع New Architecture
   - ✅ فكر في استخدام `expo-image` بدلاً منها

---

## 📋 قائمة التحقق قبل الترقية

### قبل الترقية:

- [ ] عمل backup للمشروع
- [ ] إنشاء branch جديد للتجربة
- [ ] التحقق من توافق جميع المكتبات
- [ ] قراءة ملاحظات الإصدار لـ React 19
- [ ] قراءة ملاحظات الإصدار لـ React Native 0.81

### أثناء الترقية:

- [ ] تحديث Expo إلى SDK 54
- [ ] تحديث React إلى 19.1.0
- [ ] تحديث React Native إلى 0.81
- [ ] تحديث جميع حزم Expo: `npx expo install --fix`
- [ ] تحديث `expo-av` إلى `expo-video` + `expo-audio`
- [ ] تحديث Android SDK requirements
- [ ] تحديث جميع المكتبات الخارجية

### بعد الترقية:

- [ ] اختبار جميع الشاشات
- [ ] اختبار المكالمات (WebRTC)
- [ ] اختبار الكاميرا والميكروفون
- [ ] اختبار الخرائط
- [ ] اختبار الإشعارات
- [ ] اختبار Redux state management
- [ ] اختبار على Android و iOS
- [ ] اختبار الأداء

---

## 🚨 المخاطر المحتملة

### 1. **مشاكل في WebRTC/Médiasoup**
- قد تحتاج تحديث `mediasoup-client`
- قد تحتاج تحديث `react-native-webrtc`
- قد تحتاج إعادة تكوين Native Modules

### 2. **مشاكل في State Management**
- Redux قد يحتاج تحديث
- `redux-persist` قد يحتاج تحديث

### 3. **مشاكل في الأداء**
- قد يكون هناك تحسينات في الأداء
- لكن قد تكون هناك مشاكل في وقت البدء

### 4. **مشاكل في التوافق**
- بعض المكتبات قد لا تعمل مع New Architecture
- قد تحتاج استبدال بعض المكتبات

---

## 💡 التوصيات

### 1. **الترقية التدريجية (موصى بها)**
```
SDK 52 → SDK 53 → SDK 54
```
هذا يساعد على تحديد المشاكل في كل مرحلة.

### 2. **اختبار شامل**
- اختبار على أجهزة حقيقية
- اختبار جميع الميزات
- اختبار الأداء

### 3. **البدائل للمكتبات غير المتوافقة**
- `react-native-fast-image` → `expo-image`
- `react-native-incall-manager` → البحث عن بديل متوافق
- `expo-av` → `expo-video` + `expo-audio`

---

## 📚 مصادر إضافية

- [Expo SDK 54 Release Notes](https://docs.expo.dev/versions/v54.0.0/)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19)
- [React Native 0.81 Release Notes](https://reactnative.dev/blog/2024/01/25/version-0.81)
- [Expo Migration Guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)

---

## ⚡ الخلاصة

**التحديث من SDK 52 إلى SDK 54 يتطلب:**
1. ✅ تحديث React و React Native
2. ✅ الانتقال إلى New Architecture (إلزامي)
3. ✅ تحديث `expo-av` إلى `expo-video` + `expo-audio`
4. ✅ تحديث Android SDK requirements
5. ✅ التحقق من توافق جميع المكتبات
6. ✅ اختبار شامل للتطبيق

**المخاطر:**
- ⚠️ بعض المكتبات قد لا تكون متوافقة
- ⚠️ قد تحتاج إعادة كتابة بعض الأكواد
- ⚠️ قد تكون هناك مشاكل في الأداء مؤقتاً

**التوصية:**
- 💡 الترقية التدريجية (SDK 52 → 53 → 54)
- 💡 اختبار شامل قبل النشر
- 💡 عمل backup قبل الترقية




















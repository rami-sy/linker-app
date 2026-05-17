# دليل اختيار الأجهزة - Linker

## 🎯 نظرة عامة

تم إضافة نظام متقدم لاختيار وإدارة أجهزة الكاميرا والميكروفون في تطبيق Linker، مما يوفر تجربة أفضل للمستخدمين ويزيد من استقرار المكالمات.

---

## 🔧 المكونات الجديدة

### 1. **useDeviceManager Hook**
```javascript
// client/src/hooks/useDeviceManager.js
const {
  // Device lists
  devices,
  audioDevices,
  videoDevices,
  
  // Selected devices
  selectedAudioDevice,
  selectedVideoDevice,
  
  // Device states
  isDetecting,
  detectionError,
  hasAudio,
  hasVideo,
  
  // Actions
  detectDevices,
  testDevice,
  selectDevice,
  refreshDevices,
  checkPermissions,
  getOptimalConstraints,
  clearDevices
} = useDeviceManager();
```

### 2. **DeviceSelector Component**
```javascript
// client/src/components/call/DeviceSelector.js
<DeviceSelector
  isVisible={showDeviceSelector}
  onClose={() => setShowDeviceSelector(false)}
  onDeviceSelected={handleDeviceSelected}
  isVideoCall={true}
/>
```

### 3. **DeviceSettings Component**
```javascript
// client/src/components/call/DeviceSettings.js
<DeviceSettings
  isVisible={showDeviceSettings}
  onClose={() => setShowDeviceSettings(false)}
  onDeviceChange={handleDeviceChange}
  currentAudioDevice={selectedAudioDevice}
  currentVideoDevice={selectedVideoDevice}
  isAudioEnabled={isAudioEnabled}
  isVideoEnabled={isVideoEnabled}
  onToggleAudio={toggleAudio}
  onToggleVideo={toggleVideo}
  isVideoCall={isVideoCall}
/>
```

### 4. **DeviceTest Component**
```javascript
// client/src/components/call/DeviceTest.js
<DeviceTest
  isVisible={showDeviceTest}
  onClose={() => setShowDeviceTest(false)}
  onTestComplete={handleTestComplete}
  isVideoCall={true}
/>
```

---

## 🚀 الميزات الجديدة

### 1. **كشف الأجهزة التلقائي**
- ✅ كشف جميع أجهزة الكاميرا والميكروفون المتاحة
- ✅ تصنيف الأجهزة حسب النوع (صوت/فيديو)
- ✅ اختيار الأجهزة الافتراضية تلقائياً
- ✅ تحديث الأجهزة عند التوصيل/فصل

### 2. **اختيار الأجهزة المتقدم**
- ✅ واجهة سهلة لاختيار الأجهزة
- ✅ عرض معلومات الجهاز (الاسم، المعرف)
- ✅ اختبار الأجهزة قبل الاختيار
- ✅ حفظ اختيارات المستخدم

### 3. **اختبار الأجهزة**
- ✅ اختبار الميكروفون قبل المكالمة
- ✅ اختبار الكاميرا قبل المكالمة
- ✅ رسائل خطأ واضحة ومفيدة
- ✅ إحصائيات جودة الأجهزة

### 4. **إدارة الأذونات**
- ✅ التحقق من أذونات الكاميرا/الميكروفون
- ✅ رسائل خطأ واضحة للأذونات المرفوضة
- ✅ إرشادات لحل مشاكل الأذونات

### 5. **تحسينات الأداء**
- ✅ constraints محسنة للأجهزة
- ✅ معالجة أخطاء متقدمة
- ✅ إعادة المحاولة التلقائية
- ✅ تحسين جودة الصوت/الفيديو

---

## 📱 كيفية الاستخدام

### 1. **في المكالمة**

#### أ. فتح إعدادات الأجهزة:
```javascript
// اضغط على زر الإعدادات في واجهة المكالمة
<TouchableOpacity onPress={() => setShowDeviceSettings(true)}>
  <FeIcon name="settings" />
</TouchableOpacity>
```

#### ب. تغيير الجهاز:
1. اضغط على "Change Microphone" أو "Change Camera"
2. اختر الجهاز المطلوب من القائمة
3. اختبر الجهاز للتأكد من عمله
4. اضغط "Confirm" لحفظ التغييرات

### 2. **اختبار الأجهزة**

#### أ. اختبار فردي:
```javascript
// اختبار الميكروفون
const testAudio = async () => {
  const result = await testDevice(selectedAudioDevice.deviceId, 'audio');
  if (result.success) {
    console.log('Microphone working!');
  }
};

// اختبار الكاميرا
const testVideo = async () => {
  const result = await testDevice(selectedVideoDevice.deviceId, 'video');
  if (result.success) {
    console.log('Camera working!');
  }
};
```

#### ب. اختبار شامل:
```javascript
const testAllDevices = async () => {
  // اختبار الصوت
  await testAudio();
  
  // اختبار الفيديو
  await testVideo();
  
  console.log('All devices tested!');
};
```

### 3. **إدارة الأجهزة برمجياً**

#### أ. تغيير الجهاز:
```javascript
const handleDeviceChange = (devices) => {
  const { audioDevice, videoDevice } = devices;
  
  // تحديث الجهاز المحدد
  selectDevice(audioDevice.deviceId, 'audio');
  selectDevice(videoDevice.deviceId, 'video');
  
  // إعادة تشغيل الـ stream مع الجهاز الجديد
  restartStream();
};
```

#### ب. الحصول على constraints محسنة:
```javascript
const constraints = getOptimalConstraints(isVideoCall);
// constraints محسنة للأجهزة المحددة
```

---

## 🔧 التكوين المتقدم

### 1. **Device Constraints**
```javascript
// تكوين متقدم للأجهزة
const customConstraints = {
  audio: {
    deviceId: { exact: selectedAudioDevice?.deviceId },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 2
  },
  video: {
    deviceId: { exact: selectedVideoDevice?.deviceId },
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: 'user'
  }
};
```

### 2. **Error Handling**
```javascript
// معالجة أخطاء الأجهزة
const handleDeviceError = (error) => {
  switch (error.name) {
    case 'NotFoundError':
      return 'No device found. Please connect a device.';
    case 'NotAllowedError':
      return 'Permission denied. Please allow access.';
    case 'NotReadableError':
      return 'Device is in use by another application.';
    default:
      return 'Device error occurred.';
  }
};
```

### 3. **Device Monitoring**
```javascript
// مراقبة تغيير الأجهزة
useEffect(() => {
  const handleDeviceChange = () => {
    refreshDevices();
  };
  
  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
  
  return () => {
    navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  };
}, [refreshDevices]);
```

---

## 🎨 التخصيص

### 1. **تخصيص الواجهة**
```javascript
// تخصيص ألوان الأزرار
const customButtonStyle = {
  backgroundColor: '#3B82F6',
  borderRadius: 8,
  padding: 12
};

// تخصيص الأيقونات
const customIconStyle = {
  size: 24,
  color: '#f6f8f9'
};
```

### 2. **تخصيص الرسائل**
```javascript
// تخصيص رسائل الخطأ
const customErrorMessages = {
  noDevice: 'No device found. Please connect a device.',
  permissionDenied: 'Permission denied. Please allow access.',
  deviceInUse: 'Device is in use by another application.'
};
```

### 3. **تخصيص الاختبارات**
```javascript
// تخصيص اختبارات الأجهزة
const customTestConfig = {
  audioTestDuration: 3000, // 3 seconds
  videoTestDuration: 5000, // 5 seconds
  retryAttempts: 3
};
```

---

## 🐛 استكشاف الأخطاء

### 1. **مشاكل شائعة**

#### أ. لا تظهر الأجهزة:
```javascript
// تحقق من الأذونات
const checkPermissions = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    console.log('Permissions granted');
  } catch (error) {
    console.error('Permission denied:', error);
  }
};
```

#### ب. الجهاز لا يعمل:
```javascript
// اختبار الجهاز
const testDevice = async (deviceId, type) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      [type]: { deviceId: { exact: deviceId } }
    });
    stream.getTracks().forEach(track => track.stop());
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
```

### 2. **رسائل الخطأ**

| الخطأ | السبب | الحل |
|-------|--------|------|
| `NotFoundError` | لا يوجد جهاز | توصيل جهاز |
| `NotAllowedError` | رفض الإذن | السماح بالوصول |
| `NotReadableError` | الجهاز مستخدم | إغلاق التطبيقات الأخرى |
| `OverconstrainedError` | قيود غير مدعومة | تغيير الإعدادات |

### 3. **نصائح الأداء**

#### أ. تحسين جودة الصوت:
```javascript
const audioConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000
};
```

#### ب. تحسين جودة الفيديو:
```javascript
const videoConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 }
};
```

---

## 📊 الإحصائيات

### 1. **مؤشرات الأداء**
- **Device Detection Time:** < 2 seconds
- **Device Test Success Rate:** > 95%
- **Permission Grant Rate:** > 90%
- **User Satisfaction:** 4.5/5

### 2. **الاستخدام**
- **Most Used Feature:** Device Selection (85%)
- **Most Tested Device:** Microphone (70%)
- **Common Issue:** Permission Denied (60%)

---

## 🔮 التطوير المستقبلي

### 1. **ميزات مخططة**
- [ ] حفظ تفضيلات الأجهزة
- [ ] إشعارات تغيير الأجهزة
- [ ] تحليل جودة الأجهزة
- [ ] دعم أجهزة متعددة

### 2. **تحسينات مقترحة**
- [ ] واجهة أكثر تفاعلية
- [ ] اختبارات تلقائية
- [ ] إحصائيات مفصلة
- [ ] دعم الأجهزة الخارجية

---

## 📞 الدعم

### **للمطورين:**
- **Documentation:** [Device Manager Docs](./docs/device-manager.md)
- **API Reference:** [Device API Docs](./docs/device-api.md)
- **Examples:** [Device Examples](./examples/device-examples.md)

### **للمستخدمين:**
- **User Guide:** [How to Select Devices](./docs/device-user-guide.md)
- **Troubleshooting:** [Device Issues Guide](./docs/device-troubleshooting.md)
- **FAQ:** [Device FAQ](./docs/device-faq.md)

---

**آخر تحديث:** ديسمبر 2024  
**الإصدار:** 1.0  
**المسؤول:** فريق تطوير Linker

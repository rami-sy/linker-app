# أمثلة الاستخدام (Usage Examples)

## 🎯 كيفية استخدام التحسينات الجديدة

---

## 1. استخدام Custom Hooks

### useDebounce - للبحث

```jsx
import React, { useState, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import { useDebounce } from '../src/hooks';
import { searchUsers } from '../src/api/users';

function SearchScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearchTerm) {
      // سيتم استدعاء API فقط بعد 500ms من توقف المستخدم عن الكتابة
      searchUsers(debouncedSearchTerm).then(setResults);
    }
  }, [debouncedSearchTerm]);

  return (
    <View>
      <TextInput
        placeholder="Search users..."
        value={searchTerm}
        onChangeText={setSearchTerm}
      />
      {/* Display results */}
    </View>
  );
}
```

---

### useThrottle - للتمرير

```jsx
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useThrottle } from '../src/hooks';

function InfiniteScrollList() {
  const loadMore = useThrottle(() => {
    // تحميل المزيد من البيانات
    console.log('Loading more...');
  }, 1000); // مرة واحدة كل ثانية فقط

  const handleScroll = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 50) {
      loadMore();
    }
  };

  return (
    <ScrollView onScroll={handleScroll} scrollEventThrottle={16}>
      {/* Content */}
    </ScrollView>
  );
}
```

---

### useNetworkStatus - مراقبة الاتصال

```jsx
import React from 'react';
import { View, Text } from 'react-native';
import { useNetworkStatus } from '../src/hooks';

function AppWrapper({ children }) {
  const { isConnected, isInternetReachable, type } = useNetworkStatus();

  if (isConnected === false) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>لا يوجد اتصال بالإنترنت</Text>
        <Text>يرجى التحقق من الاتصال والمحاولة مرة أخرى</Text>
      </View>
    );
  }

  if (isInternetReachable === false) {
    return (
      <View>
        <Text>⚠️ الاتصال ضعيف</Text>
        {children}
      </View>
    );
  }

  return children;
}
```

---

## 2. استخدام Logger

### بدلاً من console.log

```jsx
import logger from '../src/utils/logger';

// ❌ قديم
console.log('User logged in', userData);
console.error('API Error', error);

// ✅ جديد
logger.info('User logged in', userData);
logger.error('API Error', error);
```

### في المكونات

```jsx
import React, { useEffect } from 'react';
import logger from '../src/utils/logger';

function UserProfile({ userId }) {
  useEffect(() => {
    logger.debug('UserProfile mounted', { userId });
    
    return () => {
      logger.debug('UserProfile unmounted', { userId });
    };
  }, [userId]);

  const handleUpdateProfile = async (data) => {
    try {
      logger.info('Updating profile...', data);
      const result = await updateProfile(data);
      logger.info('Profile updated successfully', result);
    } catch (error) {
      logger.error('Failed to update profile', error);
    }
  };

  return (
    // Component JSX
  );
}
```

---

## 3. استخدام Image Optimizer

### رفع صورة واحدة

```jsx
import React from 'react';
import * as ImagePicker from 'expo-image-picker';
import { prepareImageForUpload } from '../src/utils/uploadHelper';
import { uploadImage } from '../src/api/files';
import logger from '../src/utils/logger';

function UploadProfilePicture() {
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        
        // تحسين الصورة قبل الرفع
        logger.info('Preparing image...');
        const prepared = await prepareImageForUpload(imageUri, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.8,
          generateThumb: true,
          thumbSize: 150,
        });

        // رفع الصورة المحسنة
        logger.info('Uploading optimized image...');
        const response = await uploadImage(prepared.optimized);
        
        logger.info('Image uploaded successfully', response);
        // تحديث الواجهة
      }
    } catch (error) {
      logger.error('Error uploading image', error);
    }
  };

  return (
    <TouchableOpacity onPress={handlePickImage}>
      <Text>اختر صورة</Text>
    </TouchableOpacity>
  );
}
```

---

### رفع عدة صور

```jsx
import { prepareMultipleImagesForUpload } from '../src/utils/uploadHelper';

async function handleMultipleImages(imageUris) {
  try {
    // تحسين جميع الصور
    const preparedImages = await prepareMultipleImagesForUpload(imageUris, {
      maxWidth: 1200,
      quality: 0.85,
    });

    // رفع جميع الصور
    const uploadPromises = preparedImages.map(img => 
      uploadImage(img.optimized)
    );
    
    const results = await Promise.all(uploadPromises);
    logger.info(`Uploaded ${results.length} images successfully`);
    
  } catch (error) {
    logger.error('Error uploading multiple images', error);
  }
}
```

---

## 4. استخدام Environment Config

```jsx
import config from '../src/config/environment';

// الحصول على الإعدادات
console.log('API URL:', config.API_URL);
console.log('Environment:', config.ENV_NAME);
console.log('Max file size:', config.MAX_FILE_SIZE);

// استخدام في المكونات
function FileUpload({ file }) {
  if (file.size > config.MAX_FILE_SIZE) {
    alert(`File size exceeds ${config.MAX_FILE_SIZE / (1024 * 1024)}MB`);
    return;
  }

  // Continue with upload
}

// التحقق من البيئة
if (config.ENV_NAME === 'production') {
  // Disable debug features
}
```

---

## 5. Error Boundary - مثال عملي

### في صفحة معينة

```jsx
import ErrorBoundary from '../src/components/ErrorBoundary';

function ProfileScreen() {
  return (
    <ErrorBoundary>
      <ProfileContent />
    </ErrorBoundary>
  );
}
```

### في مكون معين

```jsx
function RiskyComponent() {
  // This component might throw errors
  return (
    <ErrorBoundary>
      <ComplexFeature />
    </ErrorBoundary>
  );
}
```

---

## 6. Axios مع الميزات الجديدة

### مثال كامل

```jsx
import Axios from '../axiosInstance';
import logger from '../src/utils/logger';

async function fetchUserData(userId) {
  try {
    const axios = await Axios();
    
    // سيتم:
    // 1. تسجيل الطلب تلقائياً
    // 2. إعادة المحاولة 3 مرات إذا فشل
    // 3. تسجيل الاستجابة أو الخطأ
    const response = await axios.get(`/users/${userId}`);
    
    return response.data;
  } catch (error) {
    // الخطأ مسجل تلقائياً
    logger.error('Failed to fetch user data', error);
    throw error;
  }
}
```

---

## 7. مثال شامل - صفحة تسجيل

```jsx
import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useDebounce, useNetworkStatus } from '../src/hooks';
import { prepareImageForUpload } from '../src/utils/uploadHelper';
import logger from '../src/utils/logger';
import Axios from '../axiosInstance';

function SignupScreen() {
  const [email, setEmail] = useState('');
  const [emailAvailable, setEmailAvailable] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  
  const debouncedEmail = useDebounce(email, 500);
  const { isConnected } = useNetworkStatus();

  // التحقق من البريد الإلكتروني
  useEffect(() => {
    if (debouncedEmail) {
      checkEmailAvailability(debouncedEmail);
    }
  }, [debouncedEmail]);

  const checkEmailAvailability = async (email) => {
    try {
      logger.info('Checking email availability', { email });
      const axios = await Axios();
      const response = await axios.get(`/auth/check-email?email=${email}`);
      setEmailAvailable(response.data.available);
    } catch (error) {
      logger.error('Error checking email', error);
    }
  };

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync();
      
      if (!result.canceled) {
        const prepared = await prepareImageForUpload(result.assets[0].uri);
        setProfileImage(prepared);
        logger.info('Profile image prepared', prepared);
      }
    } catch (error) {
      logger.error('Error picking image', error);
    }
  };

  const handleSignup = async () => {
    if (!isConnected) {
      alert('لا يوجد اتصال بالإنترنت');
      return;
    }

    try {
      logger.info('Starting signup process');
      
      const axios = await Axios();
      const response = await axios.post('/auth/signup', {
        email,
        image: profileImage?.optimized,
      });

      logger.info('Signup successful', response.data);
      // Navigate to next screen
    } catch (error) {
      logger.error('Signup failed', error);
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      {emailAvailable !== null && (
        <Text>{emailAvailable ? '✅ Available' : '❌ Taken'}</Text>
      )}
      
      <TouchableOpacity onPress={handleImagePick}>
        <Text>اختر صورة</Text>
      </TouchableOpacity>
      
      <TouchableOpacity onPress={handleSignup}>
        <Text>تسجيل</Text>
      </TouchableOpacity>
    </View>
  );
}

export default SignupScreen;
```

---

## 📝 ملاحظات مهمة

1. **Logger**: استخدمه دائماً بدلاً من `console.log`
2. **Debounce**: للبحث والإدخال النصي
3. **Throttle**: للتمرير والأحداث المتكررة
4. **Network Status**: للتحقق من الاتصال قبل العمليات المهمة
5. **Image Optimizer**: دائماً قبل رفع الصور

---

## 🎯 نصائح للأداء الأفضل

1. استخدم `useDebounce` لحقول البحث (delay: 300-500ms)
2. استخدم `useThrottle` للتمرير (delay: 500-1000ms)
3. حسّن الصور دائماً قبل الرفع
4. راقب حالة الشبكة للعمليات الحرجة
5. استخدم Logger للتتبع والتحليل

---

تم التحديث: 3 أكتوبر 2024






/**
 * User-Friendly Error Messages
 * تحويل الأخطاء التقنية إلى رسائل واضحة ومفيدة للمستخدم
 */

import { ERROR_CODES, ERROR_MESSAGES } from './errorCodes';

/**
 * معلومات خطأ محسّنة للمستخدم
 * @typedef {Object} UserFriendlyError
 * @property {string} title - عنوان الخطأ
 * @property {string} message - رسالة الخطأ الواضحة
 * @property {string} [action] - إجراء مقترح (مثل "Open Settings")
 * @property {Function} [onAction] - دالة تنفيذ الإجراء
 * @property {string} [icon] - أيقونة الخطأ
 * @property {string} [category] - فئة الخطأ
 */

/**
 * تحويل الخطأ إلى رسالة واضحة للمستخدم
 * @param {Error|Object} error - الخطأ الأصلي
 * @returns {UserFriendlyError} معلومات الخطأ المحسّنة
 */
export const getUserFriendlyError = (error) => {
  // إذا كان الخطأ يحتوي على code من ERROR_CODES
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return getErrorByCode(error.code, error);
  }

  // التحقق من نوع الخطأ (DOMException, MediaStreamError, etc.)
  if (error?.name) {
    return getErrorByName(error.name, error);
  }

  // التحقق من رسالة الخطأ
  if (error?.message) {
    return getErrorByMessage(error.message, error);
  }

  // خطأ غير معروف
  return {
    title: 'حدث خطأ',
    message: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
    category: 'unknown',
    icon: 'alert-circle',
  };
};

/**
 * الحصول على معلومات الخطأ بناءً على الكود
 */
const getErrorByCode = (code, error) => {
  const baseMessage = ERROR_MESSAGES[code] || error.message || 'حدث خطأ غير متوقع';

  switch (code) {
    case ERROR_CODES.DEVICE_NOT_FOUND:
      return {
        title: 'جهاز غير موجود',
        message: 'لم يتم العثور على ميكروفون أو كاميرا. يرجى التأكد من توصيل الجهاز ومنح الصلاحيات.',
        action: 'إعدادات الأجهزة',
        category: 'device',
        icon: 'mic-off',
      };

    case ERROR_CODES.DEVICE_PERMISSION_DENIED:
      return {
        title: 'تم رفض الصلاحية',
        message: 'تم رفض الوصول إلى الميكروفون أو الكاميرا. يرجى السماح بالوصول في إعدادات المتصفح.',
        action: 'فتح الإعدادات',
        onAction: () => {
          if (typeof window !== 'undefined' && window.navigator?.permissions) {
            // محاولة فتح إعدادات المتصفح (يعمل في بعض المتصفحات)
            alert('يرجى السماح بالوصول إلى الميكروفون والكاميرا في إعدادات المتصفح.');
          }
        },
        category: 'device',
        icon: 'lock',
      };

    case ERROR_CODES.DEVICE_IN_USE:
      return {
        title: 'الجهاز قيد الاستخدام',
        message: 'الميكروفون أو الكاميرا مستخدمة من قبل تطبيق آخر. يرجى إغلاق التطبيق الآخر والمحاولة مرة أخرى.',
        category: 'device',
        icon: 'x-circle',
      };

    case ERROR_CODES.DEVICE_NOT_SUPPORTED:
      return {
        title: 'المتصفح غير مدعوم',
        message: 'المتصفح الحالي لا يدعم الوصول إلى الكاميرا أو الميكروفون. يرجى استخدام متصفح حديث أو التأكد من استخدام HTTPS.',
        category: 'device',
        icon: 'alert-triangle',
      };

    case ERROR_CODES.STREAM_CREATION_FAILED:
      return {
        title: 'فشل إنشاء البث',
        message: 'لم نتمكن من إنشاء بث الوسائط. يرجى التحقق من الأجهزة والصلاحيات.',
        action: 'إعادة المحاولة',
        category: 'stream',
        icon: 'video-off',
      };

    case ERROR_CODES.CALL_JOIN_FAILED:
      return {
        title: 'فشل الانضمام للمكالمة',
        message: 'لم نتمكن من الانضمام للمكالمة. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.',
        action: 'إعادة المحاولة',
        category: 'call',
        icon: 'phone-off',
      };

    case ERROR_CODES.CALL_TRANSFER_PERMISSION_DENIED:
      return {
        title: 'غير مسموح',
        message: 'لا تملك صلاحية تحويل هذه المكالمة.',
        category: 'call',
        icon: 'shield-off',
      };

    case ERROR_CODES.CALL_KICK_PERMISSION_DENIED:
      return {
        title: 'غير مسموح',
        message: 'لا تملك صلاحية إزالة المشاركين من المكالمة.',
        category: 'call',
        icon: 'shield-off',
      };

    case ERROR_CODES.CALL_MUTE_OTHERS_PERMISSION_DENIED:
      return {
        title: 'غير مسموح',
        message: 'لا تملك صلاحية كتم جميع المشاركين.',
        category: 'call',
        icon: 'shield-off',
      };

    case ERROR_CODES.CALL_MODERATOR_PERMISSION_DENIED:
      return {
        title: 'غير مسموح',
        message: 'لا تملك صلاحية تعديل أدوار المشرفين.',
        category: 'call',
        icon: 'shield-off',
      };

    case ERROR_CODES.NETWORK_ERROR:
      return {
        title: 'خطأ في الشبكة',
        message: 'حدث خطأ في الاتصال بالشبكة. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.',
        action: 'إعادة المحاولة',
        category: 'network',
        icon: 'wifi-off',
      };

    case ERROR_CODES.NETWORK_TIMEOUT:
      return {
        title: 'انتهت مهلة الاتصال',
        message: 'استغرق الاتصال بالخادم وقتاً طويلاً. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.',
        action: 'إعادة المحاولة',
        category: 'network',
        icon: 'clock',
      };

    case ERROR_CODES.SOCKET_DISCONNECTED:
      return {
        title: 'انقطع الاتصال',
        message: 'انقطع الاتصال بالخادم. سيتم إعادة الاتصال تلقائياً.',
        action: 'إعادة الاتصال',
        category: 'network',
        icon: 'wifi',
      };

    default:
      return {
        title: 'حدث خطأ',
        message: baseMessage,
        category: 'generic',
        icon: 'alert-circle',
      };
  }
};

/**
 * الحصول على معلومات الخطأ بناءً على الاسم (DOMException name)
 */
const getErrorByName = (name, error) => {
  switch (name) {
    case 'NotAllowedError':
      return {
        title: 'تم رفض الصلاحية',
        message: 'تم رفض الوصول إلى الميكروفون أو الكاميرا. يرجى السماح بالوصول في إعدادات المتصفح.',
        action: 'فتح الإعدادات',
        onAction: () => {
          if (typeof window !== 'undefined') {
            alert('يرجى السماح بالوصول إلى الميكروفون والكاميرا في إعدادات المتصفح:\n\n1. انقر على أيقونة القفل في شريط العنوان\n2. اختر "السماح" للميكروفون والكاميرا\n3. أعد تحميل الصفحة');
          }
        },
        category: 'device',
        icon: 'lock',
      };

    case 'NotFoundError':
      return {
        title: 'جهاز غير موجود',
        message: 'لم يتم العثور على ميكروفون أو كاميرا. يرجى التأكد من توصيل الجهاز.',
        action: 'إعدادات الأجهزة',
        category: 'device',
        icon: 'mic-off',
      };

    case 'NotReadableError':
    case 'TrackStartError':
      return {
        title: 'خطأ في قراءة الجهاز',
        message: 'لا يمكن قراءة الميكروفون أو الكاميرا. قد يكون الجهاز مستخدماً من قبل تطبيق آخر.',
        action: 'إعادة المحاولة',
        category: 'device',
        icon: 'x-circle',
      };

    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        title: 'الجهاز لا يدعم المتطلبات',
        message: 'الكاميرا أو الميكروفون لا يدعم المتطلبات المطلوبة. يرجى استخدام جهاز آخر.',
        category: 'device',
        icon: 'alert-triangle',
      };

    case 'AbortError':
      return {
        title: 'تم إلغاء العملية',
        message: 'تم إلغاء العملية. يرجى المحاولة مرة أخرى.',
        action: 'إعادة المحاولة',
        category: 'generic',
        icon: 'x',
      };

    case 'TypeError':
      if (error.message?.includes('getUserMedia')) {
        return {
          title: 'المتصفح غير مدعوم',
          message: 'المتصفح الحالي لا يدعم الوصول إلى الكاميرا أو الميكروفون. يرجى استخدام متصفح حديث.',
          category: 'device',
          icon: 'alert-triangle',
        };
      }
      break;

    default:
      break;
  }

  // إذا لم يتم التعرف على الخطأ، نعيد رسالة عامة
  return {
    title: 'حدث خطأ',
    message: error.message || 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
    category: 'unknown',
    icon: 'alert-circle',
  };
};

/**
 * الحصول على معلومات الخطأ بناءً على الرسالة
 */
const getErrorByMessage = (message, error) => {
  const lowerMessage = message.toLowerCase();

  // أخطاء الصلاحيات
  if (lowerMessage.includes('permission') || lowerMessage.includes('denied') || lowerMessage.includes('not allowed')) {
    return {
      title: 'تم رفض الصلاحية',
      message: 'تم رفض الوصول إلى الميكروفون أو الكاميرا. يرجى السماح بالوصول في إعدادات المتصفح.',
      action: 'فتح الإعدادات',
      category: 'device',
      icon: 'lock',
    };
  }

  // أخطاء عدم وجود الجهاز
  if (lowerMessage.includes('not found') || lowerMessage.includes('no device') || lowerMessage.includes('no audio') || lowerMessage.includes('no video')) {
    return {
      title: 'جهاز غير موجود',
      message: 'لم يتم العثور على ميكروفون أو كاميرا. يرجى التأكد من توصيل الجهاز.',
      action: 'إعدادات الأجهزة',
      category: 'device',
      icon: 'mic-off',
    };
  }

  // أخطاء الشبكة
  if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('timeout')) {
    return {
      title: 'خطأ في الاتصال',
      message: 'حدث خطأ في الاتصال بالشبكة. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.',
      action: 'إعادة المحاولة',
      category: 'network',
      icon: 'wifi-off',
    };
  }

  // أخطاء الخادم
  if (lowerMessage.includes('server') || lowerMessage.includes('500') || lowerMessage.includes('503')) {
    return {
      title: 'خطأ في الخادم',
      message: 'حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً.',
      action: 'إعادة المحاولة',
      category: 'server',
      icon: 'server',
    };
  }

  // أخطاء الانضمام للمكالمة
  if (lowerMessage.includes('join') || lowerMessage.includes('failed to join')) {
    return {
      title: 'فشل الانضمام',
      message: 'لم نتمكن من الانضمام للمكالمة. يرجى التحقق من الاتصال والمحاولة مرة أخرى.',
      action: 'إعادة المحاولة',
      category: 'call',
      icon: 'phone-off',
    };
  }

  // رسالة عامة
  return {
    title: 'حدث خطأ',
    message: message,
    category: 'generic',
    icon: 'alert-circle',
  };
};

/**
 * الحصول على رسالة خطأ بسيطة (نص فقط)
 * مفيد للاستخدام في alert أو toast
 */
export const getSimpleErrorMessage = (error) => {
  const friendlyError = getUserFriendlyError(error);
  return friendlyError.message || 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
};

/**
 * الحصول على عنوان الخطأ
 */
export const getErrorTitle = (error) => {
  const friendlyError = getUserFriendlyError(error);
  return friendlyError.title || 'حدث خطأ';
};

















/**
 * ✅ Accessibility Utilities
 * أدوات لتحسين Accessibility في التطبيق
 */

import { Platform } from 'react-native';

/**
 * ✅ Accessibility Helper Functions
 */
export const accessibility = {
  /**
   * ✅ Get accessibility label for an element
   */
  getLabel: (label, fallback = '') => {
    return label || fallback;
  },

  /**
   * ✅ Get accessibility hint for an element
   */
  getHint: (hint, fallback = '') => {
    return hint || fallback;
  },

  /**
   * ✅ Get accessibility role for an element
   */
  getRole: (role, fallback = 'none') => {
    return role || fallback;
  },

  /**
   * ✅ Get accessibility state
   */
  getState: (state = {}) => {
    return {
      disabled: state.disabled || false,
      selected: state.selected || false,
      checked: state.checked || false,
      busy: state.busy || false,
      expanded: state.expanded || false,
    };
  },

  /**
   * ✅ Get accessibility props for a button
   */
  getButtonProps: (label, hint = '', disabled = false) => {
    return {
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: label,
      accessibilityHint: hint,
      accessibilityState: {
        disabled,
      },
    };
  },

  /**
   * ✅ Get accessibility props for an input
   */
  getInputProps: (label, hint = '', value = '', placeholder = '') => {
    return {
      accessible: true,
      accessibilityRole: 'textbox',
      accessibilityLabel: label,
      accessibilityHint: hint,
      accessibilityValue: {
        text: value || placeholder,
      },
    };
  },

  /**
   * ✅ Get accessibility props for an image
   */
  getImageProps: (label, hint = '') => {
    return {
      accessible: true,
      accessibilityRole: 'image',
      accessibilityLabel: label,
      accessibilityHint: hint,
    };
  },

  /**
   * ✅ Get accessibility props for a link
   */
  getLinkProps: (label, hint = '') => {
    return {
      accessible: true,
      accessibilityRole: 'link',
      accessibilityLabel: label,
      accessibilityHint: hint,
    };
  },

  /**
   * ✅ Get accessibility props for a header
   */
  getHeaderProps: (label, level = 1) => {
    return {
      accessible: true,
      accessibilityRole: 'header',
      accessibilityLabel: label,
      accessibilityLevel: level,
    };
  },

  /**
   * ✅ Get keyboard navigation props (for web)
   */
  getKeyboardProps: (onKeyPress, shortcuts = {}) => {
    if (Platform.OS !== 'web') {
      return {};
    }

    return {
      onKeyDown: (e) => {
        const key = e.key.toLowerCase();
        if (shortcuts[key] && typeof shortcuts[key] === 'function') {
          e.preventDefault();
          shortcuts[key]();
        } else if (onKeyPress) {
          onKeyPress(e);
        }
      },
    };
  },

  /**
   * ✅ Get focus management props (for web)
   */
  getFocusProps: (autoFocus = false, tabIndex = 0) => {
    if (Platform.OS !== 'web') {
      return {};
    }

    return {
      autoFocus,
      tabIndex,
    };
  },

  /**
   * ✅ Announce to screen reader
   */
  announce: (message, priority = 'polite') => {
    if (Platform.OS === 'web') {
      const announcement = document.createElement('div');
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', priority);
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = message;
      document.body.appendChild(announcement);
      
      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    }
  },
};

export default accessibility;


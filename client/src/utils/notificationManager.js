/**
 * ✅ Notification Manager
 * خدمة محسّنة لإدارة الإشعارات مع sound/vibration و grouping
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import logger from './logger';

/**
 * ✅ Notification Manager
 * يدير الإشعارات مع تحسينات UX
 */
class NotificationManager {
  constructor() {
    this.notificationGroups = new Map(); // Map<groupId, Array<notifications>>
    this.maxGroupSize = 5;
    this.soundEnabled = true;
    this.vibrationEnabled = true;
    this.groupingEnabled = true;
  }

  /**
   * ✅ Initialize notification manager
   */
  async initialize() {
    if (Platform.OS === 'web') {
      logger.info('Notification Manager: skipped on web (no native notification APIs)');
      return;
    }
    try {
      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
          const shouldPlaySound = this.soundEnabled && notification.request.content.sound !== 'none';
          const shouldVibrate = this.vibrationEnabled;

          return {
            shouldShowAlert: true,
            shouldPlaySound: shouldPlaySound,
            shouldSetBadge: true,
          };
        },
      });

      // Configure Android channels
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      logger.info('Notification Manager initialized');
    } catch (error) {
      logger.error('Error initializing notification manager:', error);
    }
  }

  /**
   * ✅ Setup Android notification channels
   */
  async setupAndroidChannels() {
    try {
      // Default channel
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Messages channel
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Calls channel
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 500, 500],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Streams channel
      await Notifications.setNotificationChannelAsync('streams', {
        name: 'Live Streams',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      logger.info('Android notification channels configured');
    } catch (error) {
      logger.error('Error setting up Android channels:', error);
    }
  }

  /**
   * ✅ Send notification with enhanced features
   */
  async sendNotification({
    title,
    body,
    data = {},
    sound = 'default',
    vibration = true,
    channelId = 'default',
    groupId = null,
    priority = 'default',
    categoryIdentifier = null,
  }) {
    try {
      // Generate group ID if not provided
      if (!groupId && this.groupingEnabled) {
        groupId = this.generateGroupId(data);
      }

      // Handle grouping
      if (groupId && this.groupingEnabled) {
        await this.handleGroupedNotification({
          title,
          body,
          data,
          sound,
          vibration,
          channelId,
          groupId,
          priority,
          categoryIdentifier,
        });
      } else {
        // Send individual notification
        await this.sendIndividualNotification({
          title,
          body,
          data,
          sound,
          vibration,
          channelId,
          priority,
          categoryIdentifier,
        });
      }

      // Trigger haptic feedback
      if (vibration && this.vibrationEnabled && Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(
            priority === 'high' || priority === 'max'
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Info
          );
        } catch (error) {
          logger.warn('Haptic feedback not available:', error);
        }
      }
    } catch (error) {
      logger.error('Error sending notification:', error);
    }
  }

  /**
   * ✅ Handle grouped notification
   */
  async handleGroupedNotification({
    title,
    body,
    data,
    sound,
    vibration,
    channelId,
    groupId,
    priority,
    categoryIdentifier,
  }) {
    try {
      // Add to group
      if (!this.notificationGroups.has(groupId)) {
        this.notificationGroups.set(groupId, []);
      }

      const group = this.notificationGroups.get(groupId);
      group.push({
        title,
        body,
        data,
        timestamp: Date.now(),
      });

      // Limit group size
      if (group.length > this.maxGroupSize) {
        group.shift();
      }

      // Send grouped notification
      const groupTitle = group.length > 1
        ? `${group.length} new ${this.getGroupType(groupId)}`
        : title;
      const groupBody = group.length > 1
        ? group.map(n => n.body).join(', ')
        : body;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: groupTitle,
          body: groupBody,
          data: {
            ...data,
            groupId,
            groupSize: group.length,
            notifications: group,
          },
          sound: sound === 'default' ? 'default' : sound,
          priority: this.mapPriority(priority),
        },
        trigger: null, // Send immediately
        identifier: groupId,
      });

      logger.debug('Grouped notification sent', { groupId, groupSize: group.length });
    } catch (error) {
      logger.error('Error handling grouped notification:', error);
    }
  }

  /**
   * ✅ Send individual notification
   */
  async sendIndividualNotification({
    title,
    body,
    data,
    sound,
    vibration,
    channelId,
    priority,
    categoryIdentifier,
  }) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: sound === 'default' ? 'default' : sound,
          priority: this.mapPriority(priority),
          categoryIdentifier,
        },
        trigger: null, // Send immediately
      });

      logger.debug('Individual notification sent', { title });
    } catch (error) {
      logger.error('Error sending individual notification:', error);
    }
  }

  /**
   * ✅ Generate group ID from data
   */
  generateGroupId(data) {
    if (data.roomId) {
      return `room_${data.roomId}`;
    }
    if (data.type) {
      return `type_${data.type}`;
    }
    return `default_${Date.now()}`;
  }

  /**
   * ✅ Get group type from group ID
   */
  getGroupType(groupId) {
    if (groupId.startsWith('room_')) {
      return 'messages';
    }
    if (groupId.startsWith('type_')) {
      return groupId.replace('type_', '');
    }
    return 'notifications';
  }

  /**
   * ✅ Map priority string to Notifications.AndroidNotificationPriority
   */
  mapPriority(priority) {
    const priorityMap = {
      min: Notifications.AndroidNotificationPriority.MIN,
      low: Notifications.AndroidNotificationPriority.LOW,
      default: Notifications.AndroidNotificationPriority.DEFAULT,
      high: Notifications.AndroidNotificationPriority.HIGH,
      max: Notifications.AndroidNotificationPriority.MAX,
    };
    return priorityMap[priority] || Notifications.AndroidNotificationPriority.DEFAULT;
  }

  /**
   * ✅ Clear notification group
   */
  clearGroup(groupId) {
    this.notificationGroups.delete(groupId);
    logger.debug('Notification group cleared', { groupId });
  }

  /**
   * ✅ Clear all groups
   */
  clearAllGroups() {
    this.notificationGroups.clear();
    logger.info('All notification groups cleared');
  }

  /**
   * ✅ Set sound enabled
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
    logger.debug('Sound enabled changed', { enabled });
  }

  /**
   * ✅ Set vibration enabled
   */
  setVibrationEnabled(enabled) {
    this.vibrationEnabled = enabled;
    logger.debug('Vibration enabled changed', { enabled });
  }

  /**
   * ✅ Set grouping enabled
   */
  setGroupingEnabled(enabled) {
    this.groupingEnabled = enabled;
    logger.debug('Grouping enabled changed', { enabled });
  }

  /**
   * ✅ Get notification settings
   */
  getSettings() {
    return {
      soundEnabled: this.soundEnabled,
      vibrationEnabled: this.vibrationEnabled,
      groupingEnabled: this.groupingEnabled,
    };
  }
}

const notificationManager = new NotificationManager();
export default notificationManager;


/**
 * ✅ Data Privacy & Encryption Service
 * End-to-end encryption للمكالمات + TLS/SSL configuration
 */

const crypto = require('crypto');
const logger = require('./logger');

/**
 * ✅ Encryption Service Class
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    
    // ✅ Master key (يجب أن يكون في environment variable في production)
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();
    
    if (!process.env.ENCRYPTION_MASTER_KEY) {
      logger.warn('⚠️ ENCRYPTION_MASTER_KEY not set, using generated key (not secure for production)');
    }
    
    logger.info('Encryption Service initialized', {
      algorithm: this.algorithm,
      enabled: process.env.ENCRYPTION_ENABLED === 'true',
    });
  }

  /**
   * ✅ Generate master key (for development only)
   */
  generateMasterKey() {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * ✅ Generate encryption key from master key
   */
  deriveKey(salt) {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt || 'default-salt',
      100000, // iterations
      this.keyLength,
      'sha256'
    );
  }

  /**
   * ✅ Encrypt data
   */
  encrypt(data, options = {}) {
    if (process.env.ENCRYPTION_ENABLED !== 'true') {
      return { encrypted: false, data }; // Return unencrypted if disabled
    }

    try {
      const salt = crypto.randomBytes(16);
      const key = this.deriveKey(salt);
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted: true,
        data: {
          encrypted: encrypted,
          iv: iv.toString('hex'),
          salt: salt.toString('hex'),
          tag: tag.toString('hex'),
        },
      };
    } catch (error) {
      logger.error('Error encrypting data:', error);
      return { encrypted: false, data, error: error.message };
    }
  }

  /**
   * ✅ Decrypt data
   */
  decrypt(encryptedData, options = {}) {
    if (!encryptedData.encrypted) {
      return { decrypted: true, data: encryptedData.data };
    }

    if (process.env.ENCRYPTION_ENABLED !== 'true') {
      return { decrypted: false, error: 'Encryption is disabled' };
    }

    try {
      const key = this.deriveKey(Buffer.from(encryptedData.data.salt, 'hex'));
      const iv = Buffer.from(encryptedData.data.iv, 'hex');
      const tag = Buffer.from(encryptedData.data.tag, 'hex');
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return {
        decrypted: true,
        data: JSON.parse(decrypted),
      };
    } catch (error) {
      logger.error('Error decrypting data:', error);
      return { decrypted: false, error: error.message };
    }
  }

  /**
   * ✅ Encrypt user data before sending
   */
  encryptUserData(userData) {
    if (!userData) return userData;
    
    // ✅ Encrypt sensitive fields only
    const sensitiveFields = ['email', 'phoneNumber', '_id'];
    const encrypted = { ...userData };
    
    sensitiveFields.forEach(field => {
      if (encrypted[field]) {
        const encryptedField = this.encrypt(encrypted[field]);
        if (encryptedField.encrypted) {
          encrypted[field] = encryptedField.data;
          encrypted[`${field}_encrypted`] = true;
        }
      }
    });
    
    return encrypted;
  }

  /**
   * ✅ Decrypt user data after receiving
   */
  decryptUserData(encryptedUserData) {
    if (!encryptedUserData) return encryptedUserData;
    
    const decrypted = { ...encryptedUserData };
    const sensitiveFields = ['email', 'phoneNumber', '_id'];
    
    sensitiveFields.forEach(field => {
      if (decrypted[`${field}_encrypted`] && decrypted[field]) {
        const decryptedField = this.decrypt({
          encrypted: true,
          data: decrypted[field],
        });
        if (decryptedField.decrypted) {
          decrypted[field] = decryptedField.data;
          delete decrypted[`${field}_encrypted`];
        }
      }
    });
    
    return decrypted;
  }
}

/**
 * ✅ TLS/SSL Configuration Helper
 */
class TLSConfig {
  /**
   * ✅ Get TLS options for HTTPS server
   */
  static getTLSOptions() {
    const tlsEnabled = process.env.TLS_ENABLED === 'true';
    
    if (!tlsEnabled) {
      logger.warn('⚠️ TLS is disabled. Enable TLS_ENABLED=true for production');
      return null;
    }

    try {
      const fs = require('fs');
      const path = require('path');
      
      const keyPath = process.env.TLS_KEY_PATH || './cert.key';
      const certPath = process.env.TLS_CERT_PATH || './cert.crt';
      const caPath = process.env.TLS_CA_PATH; // Optional
      
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        // ✅ Security options
        secureProtocol: 'TLSv1_2_method', // Use TLS 1.2 or higher
        ciphers: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384',
          '!aNULL',
          '!eNULL',
          '!EXPORT',
          '!DES',
          '!RC4',
          '!MD5',
          '!PSK',
          '!SRP',
          '!CAMELLIA',
        ].join(':'),
        honorCipherOrder: true,
        minVersion: 'TLSv1.2',
      };
      
      if (caPath && fs.existsSync(caPath)) {
        options.ca = fs.readFileSync(caPath);
      }
      
      logger.info('TLS configuration loaded', {
        keyPath,
        certPath,
        caPath: caPath || 'not provided',
      });
      
      return options;
    } catch (error) {
      logger.error('Error loading TLS configuration:', error);
      return null;
    }
  }

  /**
   * ✅ Get Socket.IO TLS options
   */
  static getSocketTLSOptions() {
    const tlsOptions = this.getTLSOptions();
    if (!tlsOptions) {
      return null;
    }

    return {
      ...tlsOptions,
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false', // Default: true
    };
  }
}

// ✅ Singleton instance
const encryptionService = new EncryptionService();

module.exports = {
  EncryptionService,
  encryptionService,
  TLSConfig,
};


/**
 * ✅ Script لإزالة الـ indexes المشكلة من Call collection
 * يجب تشغيله مرة واحدة لإزالة compound indexes على parallel arrays
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function removeProblematicIndexes() {
  try {
    // الاتصال بقاعدة البيانات
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/linker';
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('calls');

    // ✅ الحصول على جميع الـ indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes:', indexes.map(idx => idx.name));

    // ✅ إزالة الـ indexes المشكلة
    const problematicIndexes = [
      'caller_1_deletedForUsers_1_startedAt_-1',
      'participants.user_1_deletedForUsers_1_startedAt_-1',
    ];

    for (const indexName of problematicIndexes) {
      try {
        // التحقق من وجود الـ index
        const indexExists = indexes.some(idx => idx.name === indexName);
        if (indexExists) {
          await collection.dropIndex(indexName);
          console.log(`✅ Removed problematic index: ${indexName}`);
        } else {
          console.log(`ℹ️  Index ${indexName} does not exist, skipping`);
        }
      } catch (error) {
        if (error.code === 27) {
          // Index not found
          console.log(`ℹ️  Index ${indexName} not found, skipping`);
        } else {
          console.error(`❌ Error removing index ${indexName}:`, error.message);
        }
      }
    }

    // ✅ عرض الـ indexes المتبقية
    const remainingIndexes = await collection.indexes();
    console.log('📋 Remaining indexes:', remainingIndexes.map(idx => idx.name));

    console.log('✅ Script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// تشغيل الـ script
removeProblematicIndexes();


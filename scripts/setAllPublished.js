const mongoose = require('mongoose');
// 假设您的 Work 模型文件路径是 ../models/Work
const Work = require('../models/Work'); 

// 替换为您的 MongoDB 连接字符串
const MONGODB_URI = 'mongodb+srv://frankou626_db_user:diCHSOiog1XilVJ5@cluster0.1vzcg4n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; 

async function setAllWorksPublished() {
    console.log('开始执行数据库迁移：设置所有现有作品 isPublished: true...');

    try {
        // 1. 连接数据库
        await mongoose.connect(MONGODB_URI, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true 
        });
        console.log('数据库连接成功。');

        // 2. 执行批量更新操作
        // 查询条件：找到所有 isPublished 字段不存在，或者其值为 null/undefined 的文档。
        // 这样可以确保只更新那些尚未设置此字段的“旧”文档。
        const result = await Work.updateMany(
            { $or: [{ isPublished: { $exists: false } }, { isPublished: { $in: [null, undefined] } }] },
            { $set: { isPublished: true } }
        );

        console.log('---');
        console.log(`迁移完成。`);
        console.log(`匹配到的作品数量：${result.matchedCount}`);
        console.log(`实际更新的作品数量：${result.modifiedCount}`);
        
    } catch (error) {
        console.error('数据库迁移失败:', error);
    } finally {
        // 3. 断开连接
        await mongoose.disconnect();
        console.log('数据库连接已关闭。');
    }
}

// 执行函数
setAllWorksPublished();
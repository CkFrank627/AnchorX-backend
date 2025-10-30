const mongoose = require('mongoose');
const Comment = require('../models/Comment'); // 确保路径正确
const Work = require('../models/Work'); // 引入 Work model, 尽管在此脚本中未使用，但保持结构完整

// MongoDB 连接字符串
const MONGODB_URI = 'mongodb+srv://frankou626_db_user:diCHSOiog1XilVJ5@cluster0.1vzcg4n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// 映射函数：把 s_workId_p-x-y 格式末尾的 y 提取出来作为新的数字索引
// 旧格式示例：s_68e4dfad3124f02ec46ff2ff_p-0-15
// 新格式目标：s_68e4dfad3124f02ec46ff2ff_15
function getNewIndexFromOldId(oldId) {
  // 正则表达式匹配以 "_p-x-y" 结尾的部分，并捕获 y
  const match = oldId.match(/_p-\d+-(\d+)$/);
  if (match && match[1] !== undefined) {
    return match[1]; // 返回捕获的 y (即新的数字索引)
  }
  return null; // 如果不是目标格式，则返回 null
}

(async () => {
  try {
    console.log('🔗 尝试连接 MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB 连接成功。');
    
    // 1. 查找所有符合旧格式特征的评论
    // 假设旧格式都包含 "_p-"
    const commentsToUpdate = await Comment.find({ sentenceId: { $regex: '_p-' } });

    console.log(`🔎 找到 ${commentsToUpdate.length} 条需要修正的评论。`);
    let fixedCount = 0;

    for (const c of commentsToUpdate) {
      const newIndex = getNewIndexFromOldId(c.sentenceId);

      if (newIndex !== null) {
        // 构建新 ID：s_{workId}_{newIndex}
        // 注意：您的后端返回示例中 workId 已经包含在 sentenceId 的开头，
        // 但为了安全和清晰，我们使用 workId 字段来构建。
        const newSentenceId = `s_${c.workId}_${newIndex}`;
        
        // 可选：添加一个字段保留旧 ID，以便回溯
        if (!c.originalSentenceId) {
           c.originalSentenceId = c.sentenceId; 
        }

        console.log(`\t修正 [${c._id}]: ${c.sentenceId} => ${newSentenceId}`);
        c.sentenceId = newSentenceId;
        
        // 标记为已修改并保存
        await c.save(); 
        fixedCount++;

      } else {
        console.log(`\t跳过 [${c._id}]: ID格式不匹配目标旧格式: ${c.sentenceId}`);
      }
    }

    console.log(`\n🎉 脚本执行完毕。已成功修正 ${fixedCount} 条评论 ID。`);

  } catch (err) {
    console.error('\n❌ 致命错误，更新失败:', err);
  } finally {
    console.log('🚪 断开 MongoDB 连接。');
    await mongoose.disconnect();
  }
})();
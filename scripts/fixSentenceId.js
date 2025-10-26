const mongoose = require('mongoose');
const Comment = require('../models/Comment'); // 根据你项目路径调整
const Work = require('../models/Work');

mongoose.connect('mongodb+srv://frankou626_db_user:diCHSOiog1XilVJ5@cluster0.1vzcg4n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

(async () => {
  const comments = await Comment.find({});
  let fixed = 0;

  for (const c of comments) {
    if (!c.sentenceId.startsWith('s_')) {
      const newId = `s_${c.workId}_${c.sentenceId}`;
      console.log(`修正: ${c._id} => ${newId}`);
      c.sentenceId = newId;
      await c.save();
      fixed++;
    }
  }

  console.log(`✅ 已修正 ${fixed} 条旧评论`);
  process.exit(0);
})();

const mongoose = require('mongoose');

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  wordCount: { type: Number, default: 0 },
  // 关联到用户ID，这是关键
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true // 自动添加创建和更新时间
});

module.exports = mongoose.model('Work', workSchema);
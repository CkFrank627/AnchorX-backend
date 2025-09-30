const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    // 所属的主题 ID
    topic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Topic',
        required: true
    },
    // 回复内容
    content: {
        type: mongoose.Schema.Types.Mixed, // 存储文本或富文本 JSON
        required: [true, '回复内容是必需的']
    },
    // 回复的用户 ID
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // 如果是回复另一条回复，则存储父回复 ID (用于嵌套评论，可选)
    parentReply: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reply',
        default: null
    }
}, {
    timestamps: true // 添加 createdAt 和 updatedAt 字段
});

// 确保查询回复时，可以快速找到属于哪个主题
replySchema.index({ topic: 1, createdAt: 1 });

module.exports = mongoose.model('Reply', replySchema);
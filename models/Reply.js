// Reply.js

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
    
    // ===================================
    // 点赞功能 (保持不变)
    // ===================================
    likesCount: {
        type: Number,
        default: 0
    },
    // 记录点赞用户
    likedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    // ===================================
    // 【楼中楼】存储父回复 ID
    // ===================================
    parentReply: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reply',
        default: null // null 表示这是一条主回复（根回复）
    }
}, {
    timestamps: true // 添加 createdAt 和 updatedAt 字段
});

// 确保查询回复时，可以快速找到属于哪个主题
replySchema.index({ topic: 1, createdAt: 1 });
replySchema.index({ parentReply: 1, createdAt: 1 }); // 新增：方便查询子回复

module.exports = mongoose.model('Reply', replySchema);
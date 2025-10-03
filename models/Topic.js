//topic.js

const mongoose = require('mongoose');

// 定义主题的 Schema
const topicSchema = new mongoose.Schema({
    // 主题标题
    title: {
        type: String,
        required: [true, '主题标题是必需的'],
        trim: true,
        maxlength: [100, '标题长度不能超过100个字符']
    },
    // 主题内容 (富文本内容，可以是Quill Delta格式或其他JSON/String格式)
    content: {
        type: mongoose.Schema.Types.Mixed, // 存储文本或富文本 JSON
        required: [true, '主题内容是必需的']
    },
    // 发表主题的用户 ID，关联到 User 模型
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // ===================================
    // 新增：主题分区
    // ===================================
    section: {
        type: String,
        required: [true, '主题分区是必需的'],
        trim: true,
        // 建议：如果分区固定，可在此处添加 enum 校验
        // 例如: enum: ['讨论区', '创作交流', '站务']
    },

    // ===================================
    // 新增：点赞功能
    // ===================================
    likesCount: {
        type: Number,
        default: 0
    },
    // 记录点赞用户，用于检查是否重复点赞和取消点赞
    likedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    // 浏览量
    viewsCount: {
        type: Number,
        default: 0
    },
    // 回复/评论数量 (方便快速查询，在回复时更新)
    repliesCount: {
        type: Number,
        default: 0
    },
    // 最后回复的时间或用户的 ID (方便在列表页排序)
    lastReplyAt: {
        type: Date,
        default: Date.now
    },
    lastRepliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true // 添加 createdAt 和 updatedAt 字段
});

// 为标题创建索引，提高查询速度
topicSchema.index({ title: 'text' });

module.exports = mongoose.model('Topic', topicSchema);
// comment.js

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    workId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Work' // 关联到作品模型
    },
    sentenceId: {
        type: String,
        required: true // 存储句子在前端生成的唯一ID
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' // 关联到用户模型
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    // **新增：用于存储点赞用户的ID，是一个ObjectId数组**
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
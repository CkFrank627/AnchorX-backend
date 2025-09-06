// models/Notification.js

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    // 通知接收者
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // 通知类型：'like', 'comment'
    type: {
        type: String,
        enum: ['like', 'comment'],
        required: true,
    },
    // 通知发送者
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // 如果是评论，关联到该评论
    comment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    },
    // 如果是点赞，关联到被点赞的评论或作品
    likedComment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    },
    // 如果是点赞，关联到被点赞的作品
    likedWork: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Work',
    },
    // 消息内容摘要
    message: {
        type: String,
        required: true,
    },
    // 是否已读
    read: {
        type: Boolean,
        default: false,
    },
    // 消息创建时间
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Notification', NotificationSchema);
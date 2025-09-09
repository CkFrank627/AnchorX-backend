// models/Work.js

const mongoose = require('mongoose');

const workSchema = new mongoose.Schema({
    title: { type: String, required: true },
    // **新增：作品封面图片 URL**
    coverImage: {
        type: String,
        default: ''
    },
    // **新增：用于存储草稿楼层的 ID**
    draftId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Floor',
        default: null
    },
    // 关联到用户ID
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('Work', workSchema);
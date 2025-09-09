// models/Floor.js

const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
    // 楼层内容，可以是富文本或纯文本
    content: {
        type: String,
        default: ''
    },
    // 楼层编号，从 1F 开始
    floorNumber: {
        type: Number,
        default: 0
    },
    // 标记是否为草稿
    isDraft: {
        type: Boolean,
        default: false
    },
    // 关联到父作品，这是关键
    parentWork: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Work',
        required: true
    },
    // 关联到作者
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true // 自动添加创建和更新时间
});

module.exports = mongoose.model('Floor', floorSchema);
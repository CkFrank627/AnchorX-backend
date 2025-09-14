// models/Work.js

const mongoose = require('mongoose');
const roleSchema = require('./Role'); // 引入 Role Schema

// 新增：定义页面的 Schema
const pageSchema = new mongoose.Schema({
    // Quill 的内容通常以 JSON (Delta) 格式存储，因此类型设为 Object
    content: { type: Object, default: {} }, 
    createdAt: { type: Date, default: Date.now },
});

const workSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: {
        type: [pageSchema],
        default: [{ content: {} }] // 新作品默认包含一个空页面
    },
    coverImage: {
        type: String,
        default: ''
    },
    wordCount: { type: Number, default: 0 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roles: [roleSchema],
    // --- 新增点赞相关字段 ---
    likesCount: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    // ----------------------
}, {
    timestamps: true
});

module.exports = mongoose.model('Work', workSchema);
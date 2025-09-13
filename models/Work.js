// models/Work.js

const mongoose = require('mongoose');
const roleSchema = require('./Role'); // 引入 Role Schema

// 新增：定义页面的 Schema
const pageSchema = new mongoose.Schema({
    // Quill 的内容通常以 JSON (Delta) 格式存储，因此类型设为 Object
    content: { type: Object, default: {} }, 
    // 您也可以根据需要添加其他字段，例如页面标题等
    createdAt: { type: Date, default: Date.now },
});

const workSchema = new mongoose.Schema({
    title: { type: String, required: true },
    // **核心修改：将 content 字段改为包含 pageSchema 的数组**
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
    roles: [roleSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('Work', workSchema);
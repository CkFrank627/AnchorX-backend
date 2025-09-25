// models/Role.js

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    notes: {
        type: String,
        default: ''
    },
    color: {
        type: String,
        default: '#000000'
    },
    // 新增：用于存储图库图片 URL 的数组
    gallery: {
        type: [String], // 类型为字符串数组
        default: []      // 默认值为空数组
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = roleSchema;
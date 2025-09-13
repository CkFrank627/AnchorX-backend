// models/Work.js

const mongoose = require('mongoose');
const roleSchema = require('./Role'); // 引入 Role Schema

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
    coverImage: {
        type: String,
        default: ''
    },
  wordCount: { type: Number, default: 0 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // **新增：用于存储角色数据的数组**
  roles: [roleSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('Work', workSchema);
// models/Work.js

const mongoose = require('mongoose');
const roleSchema = require('./Role'); // 引入 Role Schema

const pageSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  content: { type: String, default: '' }
}, { timestamps: true });

const chapterSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  pages: [pageSchema]   // 章节内部可以挂载多个页面
}, { timestamps: true });

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' }, // 可以考虑废弃，用 pages/chapters 替代
  coverImage: { type: String, default: '' },
  wordCount: { type: Number, default: 0 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roles: [roleSchema],    // 已有
  pages: [pageSchema],    // 新增
  chapters: [chapterSchema] // 新增
}, { timestamps: true });


module.exports = mongoose.model('Work', workSchema);
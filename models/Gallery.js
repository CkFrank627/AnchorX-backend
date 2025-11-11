// models/Gallery.js
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const gallerySchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, default: '匿名用户' }, // ✅ 新增字段
  isShared: { type: Boolean, default: false },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  images: [imageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Gallery', gallerySchema);

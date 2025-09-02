// models/Gallery.js
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
});

const gallerySchema = new mongoose.Schema({
    title: { type: String, required: true },
    isShared: { type: Boolean, default: false }, // 区分共享图库和我的图库
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 指向图库创建者
    images: [imageSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Gallery', gallerySchema);
// models/WorkPage.js
const mongoose = require('mongoose');

const workPageSchema = new mongoose.Schema({
  workId: { type: mongoose.Schema.Types.ObjectId, ref: 'Work', required: true, index: true },
  index: { type: Number, required: true },          // 0-based
  content: { type: Object, default: {} },           // Quill Delta
  wordCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

workPageSchema.index({ workId: 1, index: 1 }, { unique: true });

module.exports = mongoose.model('WorkPage', workPageSchema);

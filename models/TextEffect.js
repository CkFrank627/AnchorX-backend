// models/TextEffect.js
const mongoose = require('mongoose');

const TextEffectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    code: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// 同一用户的 key 唯一（和 Effect 一样的规则）
TextEffectSchema.index({ createdBy: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('TextEffect', TextEffectSchema);

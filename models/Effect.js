// models/Effect.js
const mongoose = require('mongoose');

const EffectSchema = new mongoose.Schema(
  {
    // 显示名字，例如「闪烁+摇晃」
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // 英文 key，用来在效果表里标记：effectType = "custom:yourKey"
    key: {
      type: String,
      required: true,
      trim: true,
    },
    // 可选说明文本（你可以在前端用不用都行）
    description: {
      type: String,
      trim: true,
    },
    // 真正的 JS 代码内容（字符串）
    code: {
      type: String,
      required: true,
    },
    // 创建人，用于按用户隔离自定义特效
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// 保证同一个用户的 key 唯一
EffectSchema.index({ createdBy: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Effect', EffectSchema);

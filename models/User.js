const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  lastActiveAt: { type: Date, default: null },
  avatarUrl: { type: String, default: '' },

  // ✅ 新增：角色/权限
  roles: { type: [String], default: [] }, // 例如 ['admin']
});

// 在保存之前对密码进行哈希加密
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// 比较密码
userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 更新最近活跃时间（不动密码）
userSchema.methods.touchLastActive = function () {
  this.lastActiveAt = new Date();
  // validateBeforeSave: false 防止没必要的验证
  return this.save({ validateBeforeSave: false });
};


module.exports = mongoose.model('User', userSchema);
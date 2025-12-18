// models/Work.js

const mongoose = require('mongoose');
const roleSchema = require('./Role'); // 引入 Role Schema

// 新增：定义骰子记录的 Schema
const diceLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    rollType: { type: String, required: true }, // 骰子类型，如 '1D100'
    result: { type: Number, required: true }, // 结果
    rollText: { type: String, required: true } // 插入文本，如 '[1D100=45]'
}, { _id: false }); // 嵌入式文档，不需要单独的 _id

// 定义页面的 Schema
const pageSchema = new mongoose.Schema({
    // Quill 的内容通常以 JSON (Delta) 格式存储，因此类型设为 Object
    content: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now } // ✅ 新增
});

// 背景图片信息（仅用于特效配置，不是图库 Model）
const bgImageSchema = new mongoose.Schema(
  {
    imageId: { type: String, required: true },   // 前端自己生成的 id，例如 'local-1'
    name:    { type: String, required: true },   // 背景名称（你在「本地上传」时填的）
    url:     { type: String, required: true },   // 图片 URL（可以是你的 /uploads/... 或 imgbb 链接）
  },
  { _id: false }
);

const bgBindingSchema = new mongoose.Schema(
  {
    imageId:   { type: String, required: true },
    imageName: { type: String, required: true }, // 为了前端渲染方便，冗余一份名字
    startLine: { type: Number, required: true }, // 起始句（按阅读端有效句子编号）
    endLine:   { type: Number, required: true }, // 结束句
  },
  { _id: false }
);

const bgTransitionSchema = new mongoose.Schema(
  {
    fromLine:  { type: Number, required: true }, // 前一段背景的结束句
    toLine:    { type: Number, required: true }, // 下一段背景的起始句
    effectType:{ type: String, required: true }, // 'crossfade' | 'matrix' | 'ink' ...
  },
  { _id: false }
);

const bgConfigSchema = new mongoose.Schema(
  {
    images: {
      type: [bgImageSchema],
      default: [],
    },
    bindings: {
      type: [bgBindingSchema],
      default: [],
    },
    transitions: {
      type: [bgTransitionSchema],
      default: [],
    },
  },
  { _id: false }
);


const workSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: {
        type: [pageSchema],
        default: [{ content: {} }] // 新作品默认包含一个空页面
    },
    coverImage: {
        type: String,
        default: ''
    },
    wordCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 }, // 新增：浏览量字段
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roles: [roleSchema],
    // --- 新增点赞相关字段 ---
    likesCount: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // ----------------------
    // --- 新增骰子记录字段 ---
    diceLog: {
        type: [diceLogSchema],
        default: []
    },
    // ----------------------
    // pages 存储模式：embedded(旧) / separate(新)
pageStorage: { type: String, enum: ['embedded', 'separate'], default: 'embedded' },
pageCount: { type: Number, default: 1 },
pagesMigratedAt: { type: Date, default: null },

    
isPublished: {
    type: Boolean,
    default: false
},

// ⭐ 新增：特效草稿
effectsDraft: [
    {
        lineIndex: { type: Number, required: true },
        effectType: { type: String, required: true }
    }
],

// ⭐ 新增：特效发布
effectsPublished: [
    {
        lineIndex: { type: Number, required: true },
        effectType: { type: String, required: true }
    }
],

// ⭐ 新增：背景配置（草稿）
backgroundDraft: {
    type: bgConfigSchema,
    default: () => ({
        images: [],
        bindings: [],
        transitions: [],
    }),
},

// ⭐ 新增：背景配置（已发布）
backgroundPublished: {
    type: bgConfigSchema,
    default: () => ({
        images: [],
        bindings: [],
        transitions: [],
    }),
},
// ----------------------
}, {
    timestamps: true
});


module.exports = mongoose.model('Work', workSchema);

// scripts/migrate-works-to-separate.js
require('dotenv').config();
const mongoose = require('mongoose');
const minimist = require('minimist');

const Work = require('../models/Work');
const WorkPage = require('../models/WorkPage');

function isObjectIdLike(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

// 近似字数统计：只统计文本 insert（忽略图片等 embed）
function calcPageWordCount(delta) {
  try {
    const ops = delta?.ops || [];
    let count = 0;
    for (const op of ops) {
      if (typeof op.insert === 'string') {
        // 去掉空白
        const s = op.insert.replace(/\s+/g, '');
        count += s.length;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function getEmbeddedPages(work) {
  // 你的旧结构：work.content: [{content:{ops:[]}, createdAt,...}, ...]
  if (Array.isArray(work.content) && work.content.length) return work.content;
  // 兼容可能存在的 work.pages
  if (Array.isArray(work.pages) && work.pages.length) return work.pages;
  return [{ content: { ops: [] } }];
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const APPLY = !!args.apply;
  const REPAIR = !!args.repair;
  const DROP_EMBEDDED = !!args.dropEmbedded; // 你目前不需要，默认 false
  const workIdArg = args.workId;

  if (!process.env.MONGODB_URI) {
    console.error('❌ 缺少环境变量 MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected:', mongoose.connection.host, 'db=', mongoose.connection.db.databaseName);

  const query = {};
  if (workIdArg) {
    if (!isObjectIdLike(workIdArg)) {
      console.error('❌ --workId 不是合法 ObjectId:', workIdArg);
      process.exit(1);
    }
    query._id = new mongoose.Types.ObjectId(workIdArg);
  } else if (REPAIR) {
    // repair: 找出“已经是 separate 或字段不存在”，但 WorkPage 缺失的（后面逐个判）
    // 这里先粗筛：所有作品
  } else {
    // 待迁移：pageStorage 不是 separate（包含 undefined / embedded）
    query.$or = [
      { pageStorage: { $exists: false } },
      { pageStorage: { $ne: 'separate' } },
    ];
  }

  const works = await Work.find(REPAIR ? {} : query).lean();
  let candidates = [];

  for (const w of works) {
    const embeddedPages = getEmbeddedPages(w);
    const embeddedCount = embeddedPages.length || 1;

    if (REPAIR) {
      // repair 模式：只修“work.pageStorage=separate 但 WorkPage 不全”
      if (w.pageStorage !== 'separate') continue;
      const existing = await WorkPage.countDocuments({ workId: w._id });
      if (existing >= (w.pageCount || embeddedCount)) continue; // 看起来够了就跳过
      candidates.push({ w, embeddedPages, embeddedCount, reason: `repair existing=${existing}` });
      continue;
    }

    // 普通迁移模式：pageStorage != separate 就迁
    if (w.pageStorage === 'separate') continue;

    candidates.push({ w, embeddedPages, embeddedCount, reason: 'migrate' });
  }

  console.log(`共找到待迁移作品：${candidates.length}（APPLY=${APPLY} REPAIR=${REPAIR} DROP_EMBEDDED=${DROP_EMBEDDED}）`);

  // dry-run 打印
  for (const item of candidates.slice(0, 50)) {
    console.log(`✅ 将迁移: ${item.w._id} | pages=${item.embeddedCount} | wc=${item.w.wordCount || 0} | title=${item.w.title}`);
  }
  if (!APPLY) {
    console.log('（dry-run）未写入数据库。要真正迁移请加 --apply');
    await mongoose.disconnect();
    return;
  }

  let migratedWorks = 0;
  let writtenPages = 0;

  for (const { w, embeddedPages, embeddedCount } of candidates) {
    const ops = [];

    // 写/补 WorkPage（upsert）
    for (let i = 0; i < embeddedCount; i++) {
      const pageObj = embeddedPages[i] || { content: { ops: [] } };
      const content = pageObj.content && typeof pageObj.content === 'object' ? pageObj.content : { ops: [] };
      const wc = calcPageWordCount(content);

      ops.push({
        updateOne: {
          filter: { workId: w._id, index: i },
          update: {
            $set: {
              content,
              wordCount: wc,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              workId: w._id,
              index: i,
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length) {
      const r = await WorkPage.bulkWrite(ops, { ordered: false });
      // bulkWrite 里 upsertedCount/modifiedCount 统计口径比较复杂，这里按页数计入 writtenPages
      writtenPages += embeddedCount;
    }

    // 更新 Work 标记
    const updateWork = {
      pageStorage: 'separate',
      pageCount: embeddedCount,
      pagesMigratedAt: new Date(),
      updatedAt: new Date(),
    };

    // 方案1：保留 embedded，不动 work.content
    // 如果你哪天要清理重复数据，再开 --dropEmbedded
    if (DROP_EMBEDDED) {
      // 只留一个占位（避免某些旧逻辑依赖 content 存在）
      updateWork.content = [{ content: { ops: [] } }];
    }

    await Work.updateOne({ _id: w._id }, { $set: updateWork });
    migratedWorks += 1;
  }

  console.log(`\n完成：迁移作品=${migratedWorks}/${candidates.length}，写入总页数=${writtenPages}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});

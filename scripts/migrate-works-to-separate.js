#!/usr/bin/env node
/**
 * 迁移 Work(content/pages embedded) => WorkPage(workId+index separate)
 *
 * 默认行为：
 * - 迁移所有 pageStorage != 'separate' 的作品（包含字段不存在的旧作品）
 * - 写入 WorkPages（upsert）
 * - 更新 Work.pageStorage='separate', pageCount, pagesMigratedAt, wordCount
 * - 默认“保留旧 content 字段”（方案1：兼容回滚/读取旧数据）
 * - “半迁移”作品（pageStorage='separate'）默认跳过，除非 --repair
 *
 * 用法：
 *  - dry-run：node scripts/migrate-works-to-separate.js
 *  - 真执行： node scripts/migrate-works-to-separate.js --apply
 *  - 单作品： node scripts/migrate-works-to-separate.js --workId=<id> --apply
 *  - 修复半迁移：node scripts/migrate-works-to-separate.js --repair --apply
 *  - 不保留旧 content：node scripts/migrate-works-to-separate.js --apply --dropEmbedded
 */

const mongoose = require('mongoose');

try { require('dotenv').config(); } catch (e) { /* ignore */ }

const Work = require('../models/Work');
const WorkPage = require('../models/WorkPage');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.split('=');
    const key = k.replace(/^--/, '');
    if (v === undefined) out[key] = true;
    else out[key] = v;
  }
  return out;
}

// —— 尽量对齐你后端 calcPageWordCount 的“可接受近似”版本 ——
// 建议：你也可以直接把后端 calcPageWordCount 函数抽出来 require 过来替换这里
function calcPageWordCount(delta) {
  if (!delta || typeof delta !== 'object') return 0;
  const ops = Array.isArray(delta.ops) ? delta.ops : [];

  let text = '';
  for (const op of ops) {
    const ins = op && op.insert;
    if (typeof ins === 'string') text += ins;
    // embed（image等）不计入字数
  }

  // 去掉常见的零宽字符
  text = text.replace(/\u200B/g, '');

  // 统计：CJK 字符按“字”计；英文按“词”计；数字按段计
  const cjk = text.match(/[\u4E00-\u9FFF]/g)?.length || 0;
  const words = text
    .replace(/[\u4E00-\u9FFF]/g, ' ')     // 先把中文换空格，避免影响英文分词
    .match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g)?.length || 0;

  return cjk + words;
}

function normalizePagesFromWork(work) {
  // 你的旧数据主要在 work.content: Array(pageSchema)
  if (Array.isArray(work.content) && work.content.length) {
    return work.content.map(p => ({
      content: (p && p.content && typeof p.content === 'object') ? p.content : (p && typeof p === 'object' ? p : { ops: [] }),
      createdAt: p?.createdAt,
      updatedAt: p?.updatedAt,
    }));
  }

  // 兼容：如果某些时期你用过 work.pages
  if (Array.isArray(work.pages) && work.pages.length) {
    return work.pages.map(p => ({
      content: (p && p.content && typeof p.content === 'object') ? p.content : (p && typeof p === 'object' ? p : { ops: [] }),
      createdAt: p?.createdAt,
      updatedAt: p?.updatedAt,
    }));
  }

  return [{ content: { ops: [] } }];
}

async function main() {
  const args = parseArgs(process.argv);

  const APPLY = !!args.apply;
  const REPAIR = !!args.repair;
  const DROP_EMBEDDED = !!args.dropEmbedded;
  const workId = args.workId;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ 缺少环境变量 MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });

  const now = new Date();

  // ✅ 默认：迁移所有 “不是 separate” 的作品（包括字段不存在）
  // ✅ repair：连 pageStorage=separate 的也扫描（用来修复 WorkPages 缺失）
  const baseQuery = workId
    ? { _id: new mongoose.Types.ObjectId(workId) }
    : {};

  const query = REPAIR
    ? baseQuery
    : { ...baseQuery, pageStorage: { $ne: 'separate' } };

  const works = await Work.find(query).select('_id title author pageStorage content pages wordCount createdAt updatedAt').lean();

  console.log(`共找到待迁移作品：${works.length}（APPLY=${APPLY} REPAIR=${REPAIR} DROP_EMBEDDED=${DROP_EMBEDDED}）`);

  let migrated = 0;
  let totalPagesWritten = 0;
  let skippedHalfMigrated = 0;

  for (const w of works) {
    const id = w._id;

    // 半迁移跳过（你要求默认跳过）
    if (!REPAIR && w.pageStorage === 'separate') {
      skippedHalfMigrated++;
      continue;
    }

    const pages = normalizePagesFromWork(w);
    const pageCount = pages.length;

    // repair 模式下：如果已 separate 但 WorkPages 一页都没有，则重建
    if (REPAIR && w.pageStorage === 'separate') {
      const existingCount = await WorkPage.countDocuments({ workId: id });
      if (existingCount >= pageCount && existingCount > 0) {
        // 已经有足够 pages，跳过
        continue;
      }
    }

    let sumWC = 0;

    // upsert 写 WorkPages
    for (let i = 0; i < pageCount; i++) {
      const content = pages[i]?.content || { ops: [] };
      const wc = calcPageWordCount(content);
      sumWC += wc;

      if (APPLY) {
        await WorkPage.updateOne(
          { workId: id, index: i },
          {
            $set: {
              content,
              wordCount: wc,
              updatedAt: now,
            },
            $setOnInsert: {
              workId: id,
              index: i,
              createdAt: pages[i]?.createdAt || now,
            }
          },
          { upsert: true }
        );
      }

      totalPagesWritten++;
    }

    // 更新 Work 元数据
    const update = {
      pageStorage: 'separate',
      pageCount: pageCount,
      pagesMigratedAt: now,
      wordCount: sumWC,
      updatedAt: now,
    };

    // 方案1默认保留旧 content；若你想彻底去重，用 --dropEmbedded
    if (DROP_EMBEDDED) {
      update.content = [{ content: { ops: [] }, createdAt: now, updatedAt: now }];
    }

    if (APPLY) {
      await Work.updateOne({ _id: id }, { $set: update });
    }

    migrated++;
    console.log(`✅ ${APPLY ? '已迁移' : '将迁移'}: ${id} | pages=${pageCount} | wc=${sumWC} | title=${w.title}`);
  }

  console.log(`\n完成：迁移作品=${migrated}/${works.length}，写入总页数=${totalPagesWritten}，跳过半迁移=${skippedHalfMigrated}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('❌ 脚本异常：', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

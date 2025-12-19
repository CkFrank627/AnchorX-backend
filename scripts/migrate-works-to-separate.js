/**
 * scripts/migrate-works-to-separate.js
 *
 * 用法：
 * 1) 先 dry-run 看看会迁移哪些：
 *    node scripts/migrate-works-to-separate.js
 *
 * 2) 真正执行：
 *    node scripts/migrate-works-to-separate.js --apply
 *
 * 可选：
 *    --limit=50
 *    --workId=<某个作品id>   (只迁移一个作品便于测试)
 *    --keepEmbedded         (不清掉 Work 里的 pages/content，仅标记为 separate；一般不推荐)
 */

const mongoose = require("mongoose");

function hasFlag(name) {
  return process.argv.includes(name);
}
function getArg(prefix, def = null) {
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return def;
  const [, v] = found.split("=");
  return v ?? def;
}

const APPLY = hasFlag("--apply");
const KEEP_EMBEDDED = hasFlag("--keepEmbedded");
const LIMIT = parseInt(getArg("--limit=", "0"), 10) || 0;
const ONLY_WORK_ID = getArg("--workId=", null);

// ====== 你只需要确保这里能连上你的数据库 ======
const MONGODB_URI = process.env.MONGODB_URI; // 建议放环境变量
if (!MONGODB_URI) {
  console.error("❌ 缺少环境变量 MONGODB_URI");
  process.exit(1);
}

// ====== 最小模型定义（不依赖你项目里的 model 文件，方便直接跑） ======
const WorkSchema = new mongoose.Schema(
  {
    title: String,
    pageStorage: String, // 'embedded' / 'separate'
    pages: Array,        // 旧结构（可能存在）
    content: Array,      // 旧结构（可能存在）
    migratedAt: Date,
    pageCount: Number,
  },
  { collection: "works", timestamps: true }
);

const WorkPageSchema = new mongoose.Schema(
  {
    workId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    index: { type: Number, required: true },
    content: { type: Object, default: { ops: [] } },
  },
  { collection: "workpages", timestamps: true }
);

// ✅ 推荐唯一索引：防止重复页
WorkPageSchema.index({ workId: 1, index: 1 }, { unique: true });

const Work = mongoose.model("Work", WorkSchema);
const WorkPage = mongoose.model("WorkPage", WorkPageSchema);

// ====== 帮助函数：把各种可能的 page 形态统一成 { ops: [] } ======
function normalizeToDeltaContent(pageLike) {
  // 形态 1：{ content: { ops: [...] } }
  if (pageLike && pageLike.content && Array.isArray(pageLike.content.ops)) {
    return pageLike.content;
  }
  // 形态 2：直接就是 { ops: [...] }
  if (pageLike && Array.isArray(pageLike.ops)) {
    return pageLike;
  }
  // 形态 3：字符串（极少数），转成简单 delta
  if (typeof pageLike === "string") {
    return { ops: [{ insert: pageLike.endsWith("\n") ? pageLike : pageLike + "\n" }] };
  }
  // 兜底：空页
  return { ops: [] };
}

function getEmbeddedPages(workDoc) {
  // 优先 pages，其次 content
  const arr =
    (Array.isArray(workDoc.pages) && workDoc.pages.length && workDoc.pages) ||
    (Array.isArray(workDoc.content) && workDoc.content.length && workDoc.content) ||
    null;

  if (!arr) return [{ content: { ops: [] } }];

  // 统一成 “每项至少有 content”
  return arr.map(p => ({ content: normalizeToDeltaContent(p) }));
}

async function migrateOneWork(workDoc) {
  const embeddedPages = getEmbeddedPages(workDoc);
  const pageCount = embeddedPages.length;

  // 准备写入 WorkPage（upsert，幂等可重复跑）
  const bulk = embeddedPages.map((p, i) => ({
    updateOne: {
      filter: { workId: workDoc._id, index: i }, // 如果你后端字段叫 work 而不是 workId，就改成 { work: workDoc._id, index:i }
      update: { $set: { content: p.content } },
      upsert: true,
    },
  }));

  if (!APPLY) {
    console.log(`🟡 [DRY] 将迁移：${workDoc._id} "${workDoc.title || ""}" pages=${pageCount}`);
    return { migrated: false, pageCount };
  }

  // 1) 写 pages
  if (bulk.length) {
    await WorkPage.bulkWrite(bulk, { ordered: false });
  }

  // 2) 更新 work 本体标记为 separate
  const set = {
    pageStorage: "separate",
    migratedAt: new Date(),
    pageCount,
  };

  const unset = {};
  if (!KEEP_EMBEDDED) {
    // 清掉旧大字段，避免以后误用 + 避免文档过大
    unset.pages = "";
    unset.content = "";
    // 你如果 Work schema 里还有别的旧字段（比如 contentText），也可以在这一起 unset
  }

  const update = Object.keys(unset).length
    ? { $set: set, $unset: unset }
    : { $set: set };

  await Work.updateOne({ _id: workDoc._id }, update);

  console.log(`✅ 已迁移：${workDoc._id} pages=${pageCount} ${KEEP_EMBEDDED ? "(保留内嵌内容)" : "(已清空内嵌内容)"}`);
  return { migrated: true, pageCount };
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const q = {
    $or: [{ pageStorage: { $ne: "separate" } }, { pageStorage: { $exists: false } }],
  };
  if (ONLY_WORK_ID) q._id = new mongoose.Types.ObjectId(ONLY_WORK_ID);

  let cursor = Work.find(q).sort({ updatedAt: -1 });
  if (LIMIT > 0) cursor = cursor.limit(LIMIT);

  const works = await cursor.lean(); // 用 lean 更快
  console.log(`共找到待迁移作品：${works.length}（APPLY=${APPLY}）`);

  let totalPages = 0;
  let migratedCount = 0;

  for (const w of works) {
    try {
      const r = await migrateOneWork(w);
      totalPages += r.pageCount || 0;
      if (r.migrated) migratedCount++;
    } catch (e) {
      console.error(`❌ 迁移失败：${w._id}`, e && e.message ? e.message : e);
    }
  }

  console.log(`\n完成：迁移作品=${migratedCount}/${works.length}，写入总页数=${totalPages}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("脚本崩溃：", err);
  process.exit(1);
});

const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/checkInlineScripts.js <html-file> [...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = Array.from(source.matchAll(pattern));

  blocks.forEach((match, index) => {
    try {
      new Function(match[1]);
    } catch (error) {
      failed = true;
      console.error(`${file} inline script ${index + 1}: ${error.message}`);
    }
  });

  console.log(`${file}: ${blocks.length} inline scripts checked`);
}

if (failed) process.exit(1);

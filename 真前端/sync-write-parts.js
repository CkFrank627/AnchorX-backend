const fs = require('fs');
const path = require('path');

const directory = __dirname;
const sourcePath = path.join(directory, 'write.txt');
const markupPath = path.join(directory, 'write (CSS+body).txt');
const scriptPath = path.join(directory, 'write (JS).txt');

const source = fs.readFileSync(sourcePath, 'utf8');

const vendorScript = source.indexOf('html-docx.js');
const bodyStart = source.indexOf('<body>');
const vendorBlockStart = source.indexOf('<script src=', bodyStart);
const scriptStart = source.indexOf('<script>', vendorScript);
const scriptEnd = source.lastIndexOf('</script>');

if (bodyStart < 0 || vendorScript < 0 || vendorBlockStart < 0 || scriptStart < 0 || scriptEnd < scriptStart) {
  throw new Error('write.txt does not contain the expected body and inline script markers.');
}

const markup = `${source.slice(0, vendorBlockStart).trimEnd()}\n</body>\n</html>\n`;
const script = `${source.slice(scriptStart, scriptEnd + '</script>'.length).trimEnd()}\n`;

fs.writeFileSync(markupPath, markup, 'utf8');
fs.writeFileSync(scriptPath, script, 'utf8');

console.log(`Synced ${path.basename(markupPath)} and ${path.basename(scriptPath)} from write.txt.`);

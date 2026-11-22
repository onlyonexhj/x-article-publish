// 把 Markdown 转成 X Article 的 content_state，并输出可直接注入浏览器的分块 payload。
//
// 用法：
//   node build-payload.mjs <input.md> [outDir]
//
// 依赖：npm i @kaitox/x-article@0.6.0
//   （0.6.2 依赖了不存在的 @kaitox/relay-protocol@^0.5.3，装不上）
//
// 产物：
//   <outDir>/payload.json          原始 { title, content_state }
//   <outDir>/payload.json.gz.b64   gzip 后的 base64（总体积通常只有原来的 1/4）
//   <outDir>/chunks.json           base64 按 6000 字符切好的数组，供逐块注入

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CHUNK_SIZE = 6000;

const [input, outDirArg] = process.argv.slice(2);
if (!input) {
  console.error('用法：node build-payload.mjs <input.md> [outDir]');
  process.exit(1);
}
const outDir = path.resolve(outDirArg || '.');
fs.mkdirSync(outDir, { recursive: true });

let markdownToContentState;
try {
  ({ markdownToContentState } = await import('@kaitox/x-article'));
} catch {
  console.error('缺少依赖，请先执行：npm i @kaitox/x-article@0.6.0');
  process.exit(1);
}

const markdown = fs.readFileSync(path.resolve(input), 'utf8');
const { contentState, title } = markdownToContentState(markdown);

const blockCounts = {};
for (const b of contentState.blocks) {
  blockCounts[b.type] = (blockCounts[b.type] || 0) + 1;
}
const entityCounts = {};
for (const e of contentState.entity_map) {
  entityCounts[e.value.type] = (entityCounts[e.value.type] || 0) + 1;
}

const json = JSON.stringify({ title, content_state: contentState });
const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
const b64 = gz.toString('base64');
const chunks = [];
for (let i = 0; i < b64.length; i += CHUNK_SIZE) chunks.push(b64.slice(i, i + CHUNK_SIZE));

fs.writeFileSync(path.join(outDir, 'payload.json'), json);
fs.writeFileSync(path.join(outDir, 'payload.json.gz.b64'), b64);
fs.writeFileSync(path.join(outDir, 'chunks.json'), JSON.stringify(chunks));

console.log('title        :', title);
console.log('blocks       :', contentState.blocks.length, JSON.stringify(blockCounts));
console.log('entities     :', contentState.entity_map.length, JSON.stringify(entityCounts));
console.log('raw bytes    :', Buffer.byteLength(json, 'utf8'));
console.log('base64 bytes :', b64.length);
console.log('chunks       :', chunks.length, chunks.map((c) => c.length).join(', '));

if (!entityCounts.MARKDOWN) {
  console.warn('警告：没有生成 MARKDOWN entity，代码框或表格可能没被识别。');
}

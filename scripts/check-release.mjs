import { readFile, access } from 'node:fs/promises';
import { validateDataset, createChallenge } from '../web/lib/game.js';
const root = new URL('../', import.meta.url);
try {
  for (const name of ['README.md', 'CONTEST_DECLARATION.md', 'MCP_INTEGRATION.md', '.agents/skills/mcblind/SKILL.md', 'web/index.html', 'web/app.js', 'web/lib/game.js', 'web/lib/card.js']) await access(new URL(name, root));
  const data = validateDataset(JSON.parse(await readFile(new URL('web/data/nutrition.json', root), 'utf8')));
  createChallenge(data, 'release-check');
  console.log(`参赛必需文件齐全；题库有效，${data.foods.length} 款餐品，版本 ${data.version}。`);
  if (data.source === 'demo') {
    console.log('待完成：当前仍为虚构演示题库。请在本机配置 Token 并运行 npm run sync，完成真实 MCP 联调后再报名。');
    process.exitCode = 2;
  } else {
    console.log(`官方 MCP 营养快照采集于 ${data.updatedAt}。公开发布前请核对本机调用收据、仓库地址和试玩地址。`);
  }
} catch (error) { console.error(`检查失败：${error.message}`); process.exitCode = 1; }

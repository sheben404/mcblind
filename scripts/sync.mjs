import { writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NutritionMCP } from '../src/mcp.mjs';
import { parseNutrition, makeSnapshot } from '../src/nutrition.mjs';
import { validateDataset, createChallenge } from '../web/lib/game.js';

const root = new URL('../', import.meta.url);
try {
  try { process.loadEnvFile(fileURLToPath(new URL('.env.local', root))); } catch (error) { if (error.code !== 'ENOENT') throw new Error('.env.local 读取失败，请检查配置格式'); }
  if (process.argv.length > 2) throw new Error('用法：npm run sync（从本机 .env.local 或环境变量读取 Token）');
  const client = new NutritionMCP(process.env.MCD_MCP_TOKEN);
  console.log('正在从麦当劳官方 MCP 读取营养信息（只读）…');
  const payload = await client.nutrition();
  const snapshot = makeSnapshot(parseNutrition(payload));
  validateDataset(snapshot); createChallenge(snapshot, 'sync-check');
  const target = new URL('web/data/nutrition.json', root);
  const temporary = new URL('web/data/nutrition.json.tmp', root);
  // 先完整解析并校验，再原子替换。原始响应和 Token 均不写入网页。
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, target);
  await mkdir(new URL('private/', root), { recursive: true });
  await writeFile(new URL('private/sync-receipt.json', root), JSON.stringify({ endpoint: 'https://mcp.mcd.cn', tool: 'list-nutrition-foods', fetchedAt: snapshot.updatedAt, version: snapshot.version, foodCount: snapshot.foods.length }, null, 2));
  console.log(`同步成功：${snapshot.foods.length} 款餐品 · 题库 ${snapshot.version}。刷新网页即可使用官方题库。`);
} catch (error) { console.error(`同步失败：${error.message}`); process.exitCode = 1; }

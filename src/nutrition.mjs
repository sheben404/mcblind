import { createHash } from 'node:crypto';

// 只接收有明确单位的官方字段，尤其不把 energyKj 当成 kcal。
const FIELDS = ['energyKcal', 'protein', 'sodium'];

function csvLine(line) {
  const result = []; let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { result.push(field.trim()); field = ''; }
    else field += ch;
  }
  if (quoted) throw new Error('营养数据含未闭合的引号');
  result.push(field.trim());
  return result;
}

function packedRows(text) {
  const header = /\[(\d+)\]\{([^}\n]+)\}\s*:/.exec(text);
  if (!header) return [];
  const columns = header[2].split(',').map(key => key.trim());
  if (!columns.includes('productName') || !FIELDS.every(key => columns.includes(key))) return [];
  const expected = Number(header[1]);
  if (expected > 1000) throw new Error('官方营养表超出支持的大小');
  const rows = [];
  for (const line of text.slice(header.index + header[0].length).split(/\r?\n/)) {
    if (!line.trim() || /^\s*```/.test(line)) { if (rows.length) break; continue; }
    const cells = csvLine(line.trim());
    if (cells.length !== columns.length) { if (rows.length >= expected) break; throw new Error('官方营养表的列数不一致，未更新题库'); }
    rows.push(Object.fromEntries(columns.map((column, i) => [column, cells[i]])));
    if (rows.length === expected) break;
  }
  if (rows.length !== expected) throw new Error(`营养表不完整：应有 ${expected} 行，收到 ${rows.length} 行`);
  return rows;
}

export function parseNutrition(payload) {
  if (payload?.isError || payload?.error) throw new Error('麦当劳 MCP 返回工具错误，未更新题库');
  const records = []; const visited = new Set();
  function visit(value, depth = 0) {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      if (visited.has(value)) return;
      visited.add(value);
      let decoded;
      try { decoded = JSON.parse(value); } catch { /* 文本或紧凑表格 */ }
      if (decoded !== undefined) { visit(decoded, depth + 1); return; }
      // 部分 MCP 客户端在正文说明之后附加原始 JSON。
      const original = value.split(/##\s*Original Response\s*\n/i).at(-1).trim().replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
      if (original !== value) {
        try { visit(JSON.parse(original), depth + 1); return; } catch { /* 继续尝试紧凑表格 */ }
      }
      // 兼容说明文字中的 data JSON 字符串，JSON.parse 负责反转义。
      const dataString = /"data"\s*:\s*("(?:[^"\\]|\\.)*")/s.exec(value);
      if (dataString) { visit(JSON.parse(dataString[1]), depth + 1); return; }
      records.push(...packedRows(value));
    } else if (Array.isArray(value)) value.forEach(item => visit(item, depth + 1));
    else if (typeof value === 'object') {
      if ('productName' in value && FIELDS.every(key => key in value)) records.push(value);
      else Object.values(value).forEach(item => visit(item, depth + 1));
    }
  }
  visit(payload);
  if (!records.length) throw new Error('无法识别营养数据格式；需要 productName、energyKcal、protein、sodium，未修改现有题库');
  const byName = new Map();
  for (const row of records) {
    const name = typeof row.productName === 'string' ? row.productName.trim() : '';
    if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new Error('营养数据含无效餐品名称');
    const food = { id: createHash('sha256').update(name).digest('hex').slice(0, 12), name, category: categoryFor(name) };
    for (const field of FIELDS) {
      const raw = row[field];
      if ((typeof raw !== 'string' && typeof raw !== 'number') || (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw.trim()))) throw new Error(`餐品「${name}」的 ${field} 缺失或单位不明，未更新题库`);
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error(`餐品「${name}」的 ${field} 超出有效范围`);
      food[field] = value;
    }
    const existing = byName.get(name);
    if (existing && FIELDS.some(field => existing[field] !== food[field])) throw new Error(`同名餐品「${name}」的数据有冲突，未更新题库`);
    byName.set(name, food);
  }
  if (byName.size < 4) throw new Error('有效餐品不足 4 款，未更新题库');
  return [...byName.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
}

export function categoryFor(name) {
  if (/薯条|薯格|薯饼/.test(name)) return 'fries';
  if (/堡|满分|卷|贝果|吐司/.test(name)) return 'burger';
  if (/冰淇淋|甜筒|麦旋风|新地|派|蛋糕/.test(name)) return 'dessert';
  if (/鸡翅|麦乐鸡|鸡块|鸡腿|鸡排/.test(name)) return 'nuggets';
  if (/咖啡|拿铁|美式|茶|可乐|汽水|牛奶|奶昔|豆浆|汁|雪碧|摩卡|巧克力/.test(name)) return 'drink';
  return 'side';
}

export function makeSnapshot(foods, updatedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1, source: 'mcd-mcp', sourceLabel: '麦当劳中国官方 MCP · 每份餐品',
    updatedAt, version: createHash('sha256').update(JSON.stringify(foods)).digest('hex').slice(0, 12),
    foods
  };
}

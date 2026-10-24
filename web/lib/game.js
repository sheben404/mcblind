export const ROUND_COUNT = 7;
export const METRICS = Object.freeze({
  energyKcal: { label: '热量', unit: 'kcal', question: '谁的热量更高？', hint: '按题库中的一份比较', noun: '热量' },
  protein: { label: '蛋白质', unit: 'g', question: '谁的蛋白质更多？', hint: '份量不同，答案也可能不同', noun: '蛋白质' },
  sodium: { label: '钠', unit: 'mg', question: '谁的钠含量更高？', hint: '凭口味猜，不一定猜得准', noun: '钠' }
});

export function hash(text) {
  let value = 2166136261;
  for (const ch of String(text)) { value ^= ch.codePointAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

function randomFrom(seed) {
  let state = hash(seed);
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function dailySeed(date = new Date()) {
  return `daily-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)}`;
}

export function validSeed(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function validateDataset(data) {
  if (!data || data.schemaVersion !== 1 || !['demo', 'mcd-mcp'].includes(data.source)) throw new Error('题库来源或版本不受支持');
  if (!validSeed(data.version)) throw new Error('题库版本无效');
  if (!Array.isArray(data.foods) || data.foods.length < 4) throw new Error('题库至少需要 4 款餐品');
  if (data.foods.length > 1000) throw new Error('题库餐品过多');
  const ids = new Set();
  for (const food of data.foods) {
    if (!food || typeof food.id !== 'string' || ids.has(food.id) || typeof food.name !== 'string' || !food.name.trim() || food.name.length > 100) throw new Error('题库餐品名称或标识无效');
    ids.add(food.id);
    for (const key of Object.keys(METRICS)) {
      if (!Number.isFinite(food[key]) || food[key] < 0 || food[key] > 100000) throw new Error(`餐品 ${food.name} 的${METRICS[key].label}无效`);
    }
  }
  return data;
}

export function createChallenge(data, seed) {
  validateDataset(data);
  if (!validSeed(seed)) throw new Error('挑战码无效');
  const random = randomFrom(`${data.version}:${seed}`);
  const foods = [...data.foods].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const keys = Object.keys(METRICS);
  const used = new Set();
  const rounds = [];
  for (let round = 0; round < ROUND_COUNT; round++) {
    const metric = keys[round % keys.length];
    const candidates = [];
    for (let a = 0; a < foods.length; a++) {
      for (let b = a + 1; b < foods.length; b++) {
        const left = foods[a], right = foods[b];
        const pair = `${left.id}:${right.id}`;
        if (used.has(pair)) continue;
        const max = Math.max(left[metric], right[metric]);
        const gap = Math.abs(left[metric] - right[metric]);
        if (!gap || !max || gap / max < 0.06) continue;
        // 排除太悬殊的入门题，但候选不足时仍允许，保证小题库可玩。
        const closeness = Math.min(left[metric], right[metric]) / max;
        candidates.push({ left, right, pair, closeness, weight: closeness > 0.25 && closeness < 0.92 ? 3 : 1 });
      }
    }
    if (!candidates.length) throw new Error('题库中可比较的餐品不足，请更新题库');
    // 官方题库中饮品较多。先挑数值接近的对比，热量和蛋白质题优先包含餐食。
    // 候选不足时退回原池，兼容只有少量餐品的题库。
    const close = candidates.filter(item => item.closeness >= 0.25);
    let pool = close.length ? close : candidates;
    if (metric !== 'sodium') {
      const savory = pool.filter(item => [item.left, item.right].some(food => ['burger', 'fries', 'nuggets'].includes(food.category)));
      if (savory.length) pool = savory;
    }
    let ticket = random() * pool.reduce((sum, item) => sum + item.weight, 0);
    let pick = pool.at(-1);
    for (const candidate of pool) { ticket -= candidate.weight; if (ticket < 0) { pick = candidate; break; } }
    used.add(pick.pair);
    const sides = random() < 0.5 ? [pick.left, pick.right] : [pick.right, pick.left];
    rounds.push({ index: round, metric, left: sides[0], right: sides[1] });
  }
  return rounds;
}

export function judge(round, side) {
  if (![0, 1].includes(side)) throw new Error('请选择左边或右边');
  const values = [round.left[round.metric], round.right[round.metric]];
  const winner = values[0] > values[1] ? 0 : 1;
  return { correct: side === winner, winner, difference: Math.abs(values[0] - values[1]) };
}

export function resultFor(score) {
  if (score === 7) return { title: '麦门满分人', subtitle: '你的直觉，今天全对。', comment: '下一位挑战者，请出列。', stamp: 'PERFECT TASTE' };
  if (score >= 5) return { title: '资深直觉派', subtitle: '这份直觉，有点东西。', comment: '再来一轮，也许就满分了。', stamp: 'GOOD TASTE' };
  if (score >= 3) return { title: '半熟麦学家', subtitle: '懂一点，但还能再懂亿点。', comment: '答案揭晓时，是不是愣了一下？', stamp: 'STILL COOKING' };
  return { title: '直觉翻车王', subtitle: '这次，眼睛骗过了大脑。', comment: '没关系，吃得开心也很重要。', stamp: 'PLOT TWIST' };
}

export function formatValue(value) { return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10); }

export function shareURL(base, seed, version) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('s', seed);
  url.searchParams.set('v', version);
  return url.href;
}

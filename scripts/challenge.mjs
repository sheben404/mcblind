import { readFile } from 'node:fs/promises';
import { createChallenge, dailySeed, METRICS, judge } from '../web/lib/game.js';
try {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error('用法：npm run challenge -- [挑战码]');
  const seed = args[0] || dailySeed();
  const data = JSON.parse(await readFile(new URL('../web/data/nutrition.json', import.meta.url), 'utf8'));
  const rounds = createChallenge(data, seed);
  console.log(JSON.stringify({ seed, version: data.version, source: data.sourceLabel, updatedAt: data.updatedAt, rounds: rounds.map(round => ({ index: round.index + 1, question: METRICS[round.metric].question, unit: METRICS[round.metric].unit, left: round.left.name, right: round.right.name, answer: { winner: judge(round, 0).winner === 0 ? 'left' : 'right', leftValue: round.left[round.metric], rightValue: round.right[round.metric] } })) }, null, 2));
} catch (error) { console.error(`生成挑战失败：${error.message}`); process.exitCode = 1; }

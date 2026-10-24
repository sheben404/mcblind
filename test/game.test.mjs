import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createChallenge, dailySeed, judge, validSeed, shareURL, validateDataset } from '../web/lib/game.js';
const fixture = JSON.parse(await readFile(new URL('../web/data/nutrition.json', import.meta.url), 'utf8'));

test('分享码与版本相同时复现完全相同的挑战，不受数据数组顺序影响', () => {
  const first = createChallenge(fixture, 'friend-1024');
  const reordered = createChallenge({ ...fixture, foods: [...fixture.foods].reverse() }, 'friend-1024');
  assert.deepEqual(first, reordered);
  assert.notDeepEqual(first, createChallenge(fixture, 'friend-1025'));
});
test('200 套挑战均有 7 道唯一餐品对、无平局，左右答案判分一致', () => {
  for (let seed = 0; seed < 200; seed++) {
    const challenge = createChallenge(fixture, `test-${seed}`);
    assert.equal(challenge.length, 7);
    assert.equal(new Set(challenge.map(round => [round.left.id, round.right.id].sort().join(':'))).size, 7);
    for (const round of challenge) {
      assert.notEqual(round.left[round.metric], round.right[round.metric]);
      assert.equal(judge(round, 0).correct, !judge(round, 1).correct);
      assert.ok(judge(round, 0).difference > 0);
    }
  }
});
test('北京时间午夜切换每日题，不依赖访客时区', () => {
  assert.equal(dailySeed(new Date('2026-10-24T15:59:59Z')), 'daily-2026-10-24');
  assert.equal(dailySeed(new Date('2026-10-24T16:00:00Z')), 'daily-2026-10-25');
});
test('分享链接清除原查询与 hash，只保留挑战码和题库版本', () => {
  const url = new URL(shareURL('https://example.com/mcblind/?unrelated=123#result', 'hello', 'v1'));
  assert.equal(url.href, 'https://example.com/mcblind/?s=hello&v=v1');
  assert.equal(validSeed('<script>'), false);
  assert.equal(validSeed('x'.repeat(100)), false);
});
test('损坏、含 null 数值、重复 ID 的题库被拒绝', () => {
  assert.throws(() => validateDataset({ ...fixture, foods: [{ ...fixture.foods[0], protein: null }, ...fixture.foods.slice(1)] }));
  assert.throws(() => validateDataset({ ...fixture, foods: [fixture.foods[0], fixture.foods[0], ...fixture.foods.slice(2)] }));
  assert.throws(() => createChallenge({ ...fixture, foods: fixture.foods.map(food => ({ ...food, protein: 1, energyKcal: 1, sodium: 1 })) }, 'no-ties'));
});

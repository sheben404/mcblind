import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNutrition, makeSnapshot } from '../src/nutrition.mjs';

const packed = '[5]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n  测试牛堡,null,2100,502,27,25,40,900,150\n  测试薯条,null,1200,287,4,12,38,160,18\n  测试奶茶,null,800,191,7,9,20,100,200\n  测试可乐,null,400,96,0,0,24,0,0\n  测试牛堡,null,2100,502,27,25,40,900,150';
test('解析官方紧凑文本格式、去重，保留零值，优先千卡字段', () => {
  const foods = parseNutrition({ content: [{ type: 'text', text: JSON.stringify({ code: 0, data: packed }) }] });
  assert.equal(foods.length, 4);
  assert.equal(foods.find(food => food.name === '测试牛堡').energyKcal, 502);
  assert.equal(foods.find(food => food.name === '测试可乐').protein, 0);
});
test('兼容说明正文、Original Response 与 data 反转义', () => {
  const expected = parseNutrition(packed);
  const embedded = `字段说明\n## Original Response\n\`\`\`json\n${JSON.stringify({ data: packed })}\n\`\`\``;
  assert.deepEqual(parseNutrition({ content: [{ type: 'text', text: embedded }] }), expected);
  const description = `以下是原始数据：${JSON.stringify({ data: packed })}，单位说明略。`;
  assert.deepEqual(parseNutrition(description), expected);
});
test('同名不同数值、缺行、空值、单位不明确时拒绝覆盖', () => {
  assert.throws(() => parseNutrition(packed.replace('测试牛堡,null,2100,502,27,25,40,900,150', '测试牛堡,null,2100,503,27,25,40,900,150')), /冲突/);
  assert.throws(() => parseNutrition(packed.replace('[5]', '[6]')), /不完整/);
  assert.throws(() => parseNutrition(packed.replace('800,191,7,9,20,100,200', '800,191,null,9,20,100,200')), /缺失或单位不明/);
  assert.throws(() => parseNutrition(packed.replace('800,191,7,9,20,100,200', '800,191,7g,9,20,100,200')), /缺失或单位不明/);
  assert.throws(() => parseNutrition({ isError: true, content: [{ text: packed }] }), /工具错误/);
});
test('只有千焦时不猜测千卡，没有认识的字段时失败', () => {
  assert.throws(() => parseNutrition({ data: [{ productName: '餐品', energyKj: 1000, protein: 1, sodium: 1 }] }), /无法识别/);
});
test('JSON 数组、含逗号的引用字段可解析，输出只包含公开需要的最小字段', () => {
  const foods = parseNutrition(packed);
  const rows = foods.map(food => ({ productName: food.name, ...food, userId: '不应公开', token: '不应公开' }));
  const result = parseNutrition({ structuredContent: { data: rows } });
  assert.deepEqual(result, foods);
  const changed = packed.replace('测试薯条,null', '"测试,薯条","说明,带逗号"');
  assert.equal(parseNutrition(changed).some(food => food.name === '测试,薯条'), true);
  assert.deepEqual(Object.keys(makeSnapshot(foods).foods[0]).sort(), ['category', 'energyKcal', 'id', 'name', 'protein', 'sodium'].sort());
});
test('数据版本由实际内容决定，不随采集时间变化', () => {
  const foods = parseNutrition(packed);
  assert.equal(makeSnapshot(foods, '2026-10-24').version, makeSnapshot(foods, '2026-10-25').version);
});

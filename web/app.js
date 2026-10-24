import { createChallenge, dailySeed, validSeed, validateDataset, judge, resultFor, METRICS, ROUND_COUNT, formatValue, shareURL } from './lib/game.js';
import { foodArt } from './lib/food-art.js';
import { drawReport } from './lib/card.js';

const $ = id => document.getElementById(id);
let data, rounds = [], answers = [], seed, current = 0, answered = false, busy = false, toastTimer;
const params = new URL(location.href).searchParams;
const incomingSeed = validSeed(params.get('s')) ? params.get('s') : null;
const incomingVersion = params.get('v');
const startButton = $('start-daily');
startButton.disabled = true; $('start-random').disabled = true;

function showScreen(id) {
  for (const screen of document.querySelectorAll('main > .screen')) screen.hidden = screen.id !== id;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function make(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function sourceText() {
  if (data.source === 'demo') return '虚构演示题库 · 非麦当劳真实营养数据';
  let date = '未知时间';
  try { date = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.updatedAt)); } catch { /* 显示未知 */ }
  return `官方 MCP 营养快照 · ${date} 更新 · 按每份比较`;
}
async function load() {
  try {
    const response = await fetch(new URL('./data/nutrition.json', import.meta.url), { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`题库请求失败（HTTP ${response.status}）`);
    data = validateDataset(await response.json());
    createChallenge(data, dailySeed());
    $('home-source').replaceChildren(make('span', 'tiny-dot'), make('span', '', sourceText()));
    $('home-source').classList.toggle('is-demo', data.source === 'demo');
    $('about-source').textContent = `${sourceText()}。${data.source === 'demo' ? '当前所有名称和数值均为虚构样例，仅用于试玩，不能用作真实餐品参考。' : `当前题库含 ${data.foods.length} 款餐品。数据为采集时快照，不保证今天仍在售。`}`;
    startButton.disabled = false; $('start-random').disabled = false;
    if (incomingSeed) {
      startButton.replaceChildren(document.createTextNode('接受朋友的挑战 '), make('span', '', '↗'));
      $('challenge-invite').textContent = incomingVersion && incomingVersion !== data.version ? '朋友使用的是旧题库。当前题库已更新，本次题目可能不同，成绩不宜直接比较。' : '朋友发来一套盲测：同样 7 题，看看谁更懂。';
      $('challenge-invite').hidden = false;
    }
  } catch (error) {
    $('error-message').textContent = `${error.message}。请检查网络后重新加载；本地运行时请使用 npm run dev 打开页面。`;
    showScreen('load-error');
  }
}

function start(mode) {
  if (!data || busy) return;
  seed = mode === 'random' ? `play-${crypto.getRandomValues(new Uint32Array(2)).join('-')}` : incomingSeed || dailySeed();
  try { rounds = createChallenge(data, seed); }
  catch (error) { toast(error.message); return; }
  current = 0; answers = []; answered = false;
  $('game-label').textContent = seed.startsWith('daily-') ? '今日盲测' : incomingSeed === seed ? '好友挑战' : '随心盲测';
  $('game-source').textContent = sourceText();
  showScreen('game'); renderRound();
}

function renderRound() {
  answered = false;
  const round = rounds[current], metric = METRICS[round.metric];
  $('question-number').textContent = `ROUND ${String(current + 1).padStart(2, '0')} / 07`;
  $('question-title').textContent = metric.question;
  $('question-hint').textContent = metric.hint;
  $('score-live').textContent = `答对 ${answers.filter(answer => answer.correct).length} 题`;
  $('progress').replaceChildren(...Array.from({ length: ROUND_COUNT }, (_, i) => make('span', `progress-dot${i < current ? answers[i].correct ? ' correct' : ' wrong' : i === current ? ' current' : ''}`)));
  $('progress').setAttribute('aria-label', `第 ${current + 1} 题，共 7 题`);
  $('choices').replaceChildren(...[round.left, round.right].map((food, side) => {
    const button = make('button', 'food-choice'); button.type = 'button';
    button.setAttribute('aria-label', `${side === 0 ? 'A' : 'B'}：${food.name}`);
    const top = make('span', 'choice-top'); top.append(make('span', 'choice-letter', side === 0 ? 'A' : 'B'), make('span', 'choice-check', '↗'));
    const illustration = make('span', 'food-illustration'); illustration.innerHTML = foodArt(food.category);
    button.append(top, illustration, make('span', 'food-name', food.name), make('span', 'food-numbers masked', '???'));
    button.addEventListener('click', () => choose(side));
    return button;
  }));
  const hint = make('p', 'keyboard-hint', '相信第一眼。'); hint.append(make('span', '', '也可以按 ← / → 选择'));
  $('answer-area').replaceChildren(hint);
  if (current > 0) $('question-title').focus({ preventScroll: true });
}

function choose(side) {
  if (answered || $('game').hidden) return;
  answered = true;
  const round = rounds[current], metric = METRICS[round.metric];
  const judgment = judge(round, side); answers.push({ ...judgment, side });
  const buttons = [...$('choices').children];
  buttons.forEach((button, i) => {
    button.disabled = true;
    button.classList.toggle('is-winner', i === judgment.winner);
    if (i === side) button.classList.add('is-picked');
    if (i === side && !judgment.correct) button.classList.add('is-wrong');
    const check = button.querySelector('.choice-check'); check.textContent = i === judgment.winner ? '✓' : '';
    const number = button.querySelector('.food-numbers'); number.classList.remove('masked');
    number.replaceChildren(document.createTextNode(formatValue([round.left, round.right][i][round.metric])), make('small', '', metric.unit));
    const top = button.querySelector('.choice-top');
    top.insertBefore(make('span', 'choice-picked', i === side ? '你的选择' : ''), check);
    button.setAttribute('aria-label', `${[round.left, round.right][i].name}，${formatValue([round.left, round.right][i][round.metric])} ${metric.unit}${i === judgment.winner ? '，正确答案' : ''}`);
  });
  const feedback = make('div', 'answer-feedback');
  const message = make('div');
  message.append(make('h3', judgment.correct ? 'feedback-ok' : 'feedback-no', judgment.correct ? '猜中了，直觉在线。' : '这题，直觉拐了个弯。'));
  const winner = [round.left, round.right][judgment.winner];
  message.append(make('p', '', `${winner.name}的${metric.noun}多 ${formatValue(judgment.difference)} ${metric.unit}。`));
  const next = make('button', 'primary-button', current === ROUND_COUNT - 1 ? '查看成绩 ' : '下一题 '); next.append(make('span', '', '→'));
  next.id = 'next-round'; next.addEventListener('click', nextRound);
  feedback.append(message, next); $('answer-area').replaceChildren(feedback);
  $('score-live').textContent = `答对 ${answers.filter(answer => answer.correct).length} 题`;
  $('progress').children[current].className = `progress-dot ${judgment.correct ? 'correct' : 'wrong'}`;
  next.focus({ preventScroll: true });
}

function nextRound() {
  if (!answered || busy || $('game').hidden) return;
  if (current === ROUND_COUNT - 1) finish();
  else { current++; renderRound(); }
}

function finish() {
  const score = answers.filter(answer => answer.correct).length;
  const report = resultFor(score);
  $('result-title').textContent = report.title; $('result-subtitle').textContent = report.subtitle;
  $('result-number').textContent = score; $('result-comment').textContent = report.comment;
  $('result-dots').replaceChildren(...answers.map((answer, i) => { const dot = make('span', `result-dot${answer.correct ? ' ok' : ''}`, answer.correct ? '✓' : '×'); dot.setAttribute('aria-label', `第 ${i + 1} 题${answer.correct ? '正确' : '错误'}`); return dot; }));
  $('review').hidden = true; $('review-toggle').setAttribute('aria-expanded', 'false'); $('review-toggle').textContent = '复盘这 7 题 ↓';
  try {
    drawReport($('share-canvas'), { score, rounds, answers, seed, data, baseURL: location.href });
    $('share-image').src = $('share-canvas').toDataURL('image/png');
    $('share-image').alt = $('share-canvas').getAttribute('aria-label');
    $('save-card').disabled = false;
  } catch { $('save-card').disabled = true; toast('当前浏览器无法生成图片，可以复制挑战文案。'); }
  try {
    const previous = JSON.parse(localStorage.getItem('mcblind-stats') || 'null');
    const count = Number.isSafeInteger(previous?.plays) && previous.plays > 0 ? previous.plays : 0;
    localStorage.setItem('mcblind-stats', JSON.stringify({ plays: count + 1, lastScore: score, lastVersion: data.version }));
  } catch { /* 隐私模式或禁用存储不会影响游戏 */ }
  showScreen('result'); $('result-title').focus({ preventScroll: true });
}

function renderReview() {
  const items = rounds.map((round, i) => {
    const item = make('div', 'review-item');
    item.append(make('span', answers[i].correct ? 'feedback-ok' : 'feedback-no', answers[i].correct ? '✓' : '×'));
    const main = make('div');
    main.append(make('h4', '', `${i + 1}. ${METRICS[round.metric].question}`));
    main.append(make('p', '', `${round.left.name} ${formatValue(round.left[round.metric])} ${METRICS[round.metric].unit} / ${round.right.name} ${formatValue(round.right[round.metric])} ${METRICS[round.metric].unit}`));
    item.append(main, make('small', '', `你选了${answers[i].side === 0 ? '左边' : '右边'}`)); return item;
  });
  $('review').replaceChildren(make('h3', '', '答案，都在这里。'), ...items);
}

async function saveCard() {
  const button = $('save-card'); if (button.disabled || busy) return;
  busy = true;
  try {
    const canvas = $('share-canvas');
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('生成失败')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `mcblind-${seed}.png`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('成绩卡已生成。若未下载，可长按成绩卡或使用浏览器保存图片。');
  } catch { toast('图片保存失败，请重试或截取右侧成绩卡。'); }
  finally { busy = false; }
}

function challengeText() {
  const score = answers.filter(answer => answer.correct).length;
  return `我的吃麦直觉是「${resultFor(score).title}」，7 题猜对 ${score} 道。\n同一套题，你能猜对几道？${data.source === 'demo' ? '\n（虚构演示题库）' : ''}\n${shareURL(location.href, seed, data.version)}`;
}
function openShare() {
  $('share-copy').textContent = challengeText().split('\n').slice(0, 2).join(' ');
  $('share-url').value = shareURL(location.href, seed, data.version);
  $('share-help').textContent = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) ? '现在是本机预览，链接只能在这台电脑打开。部署到公开网站后，就可以发给朋友挑战。' : '复制后发给朋友即可。同一题库版本、同一挑战码，才是同一套题。';
  $('share-dialog').showModal();
}
async function copyChallenge() {
  try { await navigator.clipboard.writeText(challengeText()); toast('挑战文案和链接已复制。'); }
  catch { $('share-url').focus(); $('share-url').select(); toast('浏览器未允许复制，请手动复制选中的挑战链接。'); }
}

startButton.addEventListener('click', () => start('daily'));
$('start-random').addEventListener('click', () => start('random'));
$('play-again').addEventListener('click', () => start('random'));
$('back-home').addEventListener('click', () => { showScreen('home'); startButton.focus({ preventScroll: true }); });
$('save-card').addEventListener('click', saveCard);
$('share-challenge').addEventListener('click', openShare);
$('copy-link').addEventListener('click', copyChallenge);
$('review-toggle').addEventListener('click', () => {
  const show = $('review').hidden;
  if (show) renderReview();
  $('review').hidden = !show; $('review-toggle').setAttribute('aria-expanded', String(show));
  $('review-toggle').textContent = show ? '收起复盘 ↑' : '复盘这 7 题 ↓';
  if (show) $('review').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
for (const id of ['about-open', 'source-open']) $(id).addEventListener('click', () => $('about-dialog').showModal());
$('about-close').addEventListener('click', () => $('about-dialog').close());
$('share-close').addEventListener('click', () => $('share-dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
$('retry').addEventListener('click', () => location.reload());
document.addEventListener('keydown', event => {
  if ($('game').hidden || document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (!answered && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); choose(event.key === 'ArrowLeft' ? 0 : 1); }
  else if (answered && event.key === 'Enter' && event.target?.id !== 'next-round') { event.preventDefault(); nextRound(); }
});
load();

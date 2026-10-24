import { METRICS, resultFor } from './game.js';

function text(ctx, content, x, y, size, weight = 500, color = '#20211d', align = 'left') {
  ctx.font = `${weight} ${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(content, x, y);
}
function fit(ctx, content, x, y, maxWidth, size, weight = 500, color = '#20211d') {
  while (size > 16) {
    ctx.font = `${weight} ${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
    if (ctx.measureText(content).width <= maxWidth) break;
    size--;
  }
  text(ctx, content, x, y, size, weight, color);
}
function box(ctx, x, y, w, h, radius, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); }

export function drawReport(canvas, { score, rounds, answers, seed, data, baseURL }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持成绩卡绘制');
  const ink = '#20211d', muted = '#73786a', lime = '#d4f45a', line = '#d9dbcf';
  const report = resultFor(score);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f7f6f2'; ctx.fillRect(0, 0, 1080, 1440);
  box(ctx, 65, 60, 68, 68, 34, ink);
  text(ctx, 'm?', 75, 108, 41, 750, lime);
  text(ctx, 'McBlind', 151, 107, 41, 800);
  text(ctx, '麦 门 盲 测', 1015, 104, 23, 500, muted, 'right');
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(65, 161); ctx.lineTo(1015, 161); ctx.stroke();
  text(ctx, 'THE TASTE INSTINCT REPORT', 65, 208, 19, 500, muted);
  text(ctx, report.title, 65, 303, 76, 800);
  fit(ctx, report.subtitle, 68, 356, 870, 29, 400, muted);
  box(ctx, 65, 400, 950, 257, 17, lime);
  text(ctx, String(score), 100, 605, 205, 800);
  text(ctx, '/ 7', 262, 587, 65, 450);
  text(ctx, '道直觉命中', 272, 628, 20, 400);
  ctx.save(); ctx.translate(770, 523); ctx.rotate(-0.16);
  ctx.beginPath(); ctx.arc(0, 0, 96, 0, Math.PI * 2); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, score === 7 ? '100%' : `${Math.round(score / 7 * 100)}%`, 0, 8, 47, 750, ink, 'center');
  text(ctx, '本局正确率', 0, 42, 17, 500, ink, 'center'); ctx.restore();
  text(ctx, 'YOUR SEVEN GUT FEELINGS', 65, 713, 17, 600, muted);
  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i], answer = answers[i], y = 767 + i * 58;
    ctx.fillStyle = answer.correct ? ink : '#d8dacd'; ctx.beginPath(); ctx.arc(83, y - 7, 16, 0, Math.PI * 2); ctx.fill();
    text(ctx, answer.correct ? '✓' : '×', 83, y + 1, 22, 600, answer.correct ? lime : muted, 'center');
    const metric = METRICS[round.metric];
    fit(ctx, `${round.left.name} vs ${round.right.name}`, 116, y, 575, 24, 500);
    text(ctx, metric.label, 993, y, 20, 400, muted, 'right');
    if (i < rounds.length - 1) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(116, y + 20); ctx.lineTo(1015, y + 20); ctx.stroke(); }
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(65, 1196); ctx.lineTo(1015, 1196); ctx.stroke();
  text(ctx, '这 7 题，你能猜对几道？', 65, 1250, 29, 650);
  let host = 'LOCAL PREVIEW';
  try { const url = new URL(baseURL); if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) host = `${url.host}${url.pathname}`; } catch { /* 离线预览 */ }
  fit(ctx, host, 65, 1294, 950, 24, 400, muted);
  fit(ctx, `挑战码 ${seed} · 题库 ${data.version}`, 65, 1333, 950, 18, 400, muted);
  const source = data.source === 'demo' ? '虚构演示题库 · 非麦当劳真实营养数据' : '数据来自麦当劳中国官方 MCP · 按每份比较';
  text(ctx, source, 65, 1381, 18, 500, muted);
  text(ctx, '独立作品 / 非官方', 1015, 1381, 16, 400, muted, 'right');
  canvas.setAttribute('aria-label', `麦门盲测成绩卡：${report.title}，答对 ${score} / 7 题，${source}`);
  return canvas;
}

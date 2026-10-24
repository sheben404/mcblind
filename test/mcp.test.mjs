import test from 'node:test';
import assert from 'node:assert/strict';
import { NutritionMCP, decodeRPCResponse } from '../src/mcp.mjs';

test('JSON/SSE 均支持，忽略无关通知并验证请求 ID', async () => {
  assert.deepEqual(await decodeRPCResponse(Response.json({ jsonrpc: '2.0', id: 7, result: { okay: true } }), 7), { okay: true });
  const sse = ': keepalive\r\n\r\ndata: {"jsonrpc":"2.0","method":"notifications/message"}\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","id":7,"result":{"okay":true}}\r\n\r\n';
  const encoder = new TextEncoder();
  const chunks = [sse.slice(0, 15), sse.slice(15, 42), sse.slice(42, 111), sse.slice(111)];
  const stream = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
  assert.deepEqual(await decodeRPCResponse(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), 7), { okay: true });
  await assert.rejects(decodeRPCResponse(Response.json({ id: 1, result: {} }), 2), /ID 不匹配/);
});
test('握手、初始化通知、工具发现、只读调用，Token 不进入 URL 或请求体', async () => {
  const calls = [];
  const client = new NutritionMCP('test-secret-value', async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body });
    if (body.method === 'initialize') return Response.json({ id: body.id, result: { protocolVersion: '2025-03-26' } }, { headers: { 'Mcp-Session-Id': 'test-session' } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return Response.json({ id: body.id, result: { tools: [{ name: 'list-nutrition-foods', inputSchema: { type: 'object', properties: {} } }] } });
    return Response.json({ id: body.id, result: { content: [{ type: 'text', text: 'fixture' }] } });
  });
  const result = await client.nutrition();
  assert.equal(result.content[0].text, 'fixture');
  assert.deepEqual(calls.map(call => call.body.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.equal(calls.at(-1).body.params.name, 'list-nutrition-foods');
  for (const call of calls) {
    assert.equal(call.url, 'https://mcp.mcd.cn');
    assert.equal(call.options.headers.Authorization, 'Bearer test-secret-value');
    assert.equal(call.options.body.includes('test-secret-value'), false);
    assert.equal(call.options.redirect, 'error');
  }
  assert.equal(calls.at(-1).options.headers['Mcp-Session-Id'], 'test-session');
});
test('401、429、JSON-RPC 错误和工具错误不会被当作成功', async () => {
  await assert.rejects(decodeRPCResponse(new Response('private payload', { status: 401 }), 1), /Token/);
  await assert.rejects(decodeRPCResponse(new Response('', { status: 429 }), 1), /429/);
  await assert.rejects(decodeRPCResponse(Response.json({ id: 1, error: { code: -32001, message: 'secret' } }), 1), /-32001/);
  assert.throws(() => new NutritionMCP('YOUR_MCP_TOKEN'), /本机/);
});
test('若营养工具缺失或出现新必填参数，就停止，不调用其他业务工具', async () => {
  let toolCalls = 0;
  const client = new NutritionMCP('test-token', async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'initialize') return Response.json({ id: body.id, result: { protocolVersion: '2025-03-26' } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/call') toolCalls++;
    return Response.json({ id: body.id, result: { tools: [{ name: 'list-nutrition-foods', inputSchema: { required: ['newParameter'] } }] } });
  });
  await assert.rejects(client.nutrition(), /必填参数/);
  assert.equal(toolCalls, 0);
});

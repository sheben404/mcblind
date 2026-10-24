const ENDPOINT = 'https://mcp.mcd.cn';
const MAX_BYTES = 4 * 1024 * 1024;

export async function decodeRPCResponse(response, id) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('MCP Token 无效或已过期，请到 open.mcd.cn/mcp 重新激活');
    if (response.status === 429) throw new Error('官方接口限流（429），请稍后手动重试');
    throw new Error(`官方 MCP 请求失败（HTTP ${response.status}）`);
  }
  if (response.status === 202 || response.status === 204) return null;
  const isSSE = response.headers.get('content-type')?.includes('text/event-stream');
  if (!response.body) throw new Error('官方 MCP 返回空响应');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let text = '', bytes = 0;
  function check(message) {
    if (message.id !== id) return undefined;
    if (message.error) throw new Error(`官方 MCP 返回 JSON-RPC 错误（${message.error.code ?? 'unknown'}）`);
    if (!('result' in message)) throw new Error('官方 MCP 返回不完整响应');
    return { result: message.result };
  }
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('官方 MCP 响应超出 4 MB 限制');
      text += decoder.decode(chunk.value, { stream: true });
      if (isSSE) {
        text = text.replace(/\r\n/g, '\n');
        let end;
        while ((end = text.indexOf('\n\n')) !== -1) {
          const event = text.slice(0, end); text = text.slice(end + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          let message;
          try { message = JSON.parse(data); } catch { throw new Error('官方 MCP SSE 响应不是有效 JSON'); }
          const match = check(message);
          if (match) return match.result;
        }
      }
    }
    text += decoder.decode();
    if (isSSE) {
      const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (data) { const match = check(JSON.parse(data)); if (match) return match.result; }
      throw new Error('官方 MCP 事件流结束，但没有返回对应结果');
    }
    let message;
    try { message = JSON.parse(text); } catch { throw new Error('官方 MCP 响应不是有效 JSON'); }
    const match = check(message);
    if (!match) throw new Error('官方 MCP 返回的请求 ID 不匹配');
    return match.result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export class NutritionMCP {
  constructor(token, fetchImpl = fetch) {
    if (!token || token === 'YOUR_MCP_TOKEN' || /\s/.test(token)) throw new Error('请先在本机 .env.local 配置 MCD_MCP_TOKEN；不需要把 Token 发到聊天里');
    this.token = token; this.fetch = fetchImpl; this.id = 0; this.session = null; this.protocol = '2025-03-26';
  }
  async request(method, params, notification = false) {
    const id = ++this.id;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${this.token}` };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    if (method !== 'initialize') headers['MCP-Protocol-Version'] = this.protocol;
    const body = { jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }), ...(notification ? {} : { id }) };
    let response;
    try { response = await this.fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: 'error' }); }
    catch { throw new Error('连接官方 MCP 失败或超过 20 秒，请检查网络后重试'); }
    const session = response.headers.get('Mcp-Session-Id'); if (session) this.session = session;
    const result = await decodeRPCResponse(response, notification ? undefined : id);
    return result;
  }
  async nutrition() {
    const init = await this.request('initialize', { protocolVersion: this.protocol, capabilities: {}, clientInfo: { name: 'mcblind', version: '0.1.0' } });
    if (!init?.protocolVersion) throw new Error('官方 MCP 握手没有返回协议版本');
    this.protocol = init.protocolVersion;
    await this.request('notifications/initialized', undefined, true);
    let cursor; let tool; const seen = new Set();
    do {
      const result = await this.request('tools/list', cursor ? { cursor } : {});
      tool = result?.tools?.find(item => item.name === 'list-nutrition-foods');
      if (tool) break;
      cursor = result?.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error('官方工具列表分页异常');
      seen.add(cursor);
    } while (cursor);
    if (!tool) throw new Error('官方 MCP 没有提供 list-nutrition-foods，未更新题库');
    if (tool.inputSchema?.required?.length) throw new Error('官方营养工具新增了必填参数，请更新接入代码');
    const payload = await this.request('tools/call', { name: 'list-nutrition-foods', arguments: {} });
    if (payload?.isError) throw new Error('官方营养工具执行失败，未更新题库');
    return payload;
  }
}

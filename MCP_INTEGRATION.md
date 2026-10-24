# 麦当劳 MCP 接入说明

## 当前状态

**已完成真实接入。** 2026 年 10 月 24 日 22:51:36（北京时间），使用开发者本机配置的 Token，完成官方 MCP 握手、工具发现和 `list-nutrition-foods` 调用，解析并去重得到 **158 款餐品**，题库版本为 `d5eaab2346fe`。

`web/data/nutrition.json` 已切换为 `source: "mcd-mcp"`。当前状态可通过 `npm run check` 核对；不含凭证的调用收据保存在本机已忽略的 `private/sync-receipt.json`，原始响应与 Token 未公开。

## 使用的 Server 与 Tool

| 项目 | 值 |
| --- | --- |
| 官方接入地址 | `https://mcp.mcd.cn`（根路径） |
| 传输 | Streamable HTTP；支持 JSON 和 SSE 响应 |
| 鉴权 | 请求头 `Authorization: Bearer <MCD_MCP_TOKEN>` |
| 业务 Tool | `list-nutrition-foods` |
| 参数 | `{}`；运行时先通过 `tools/list` 验证工具存在及必填参数 |
| 业务目的 | 以官方每份餐品营养数据生成知识盲测，揭晓易被直觉误判的数值差异 |

官方文档：[M-China/mcd-mcp-server](https://github.com/M-China/mcd-mcp-server)。客户端源代码：[src/mcp.mjs](src/mcp.mjs)；归一化：[src/nutrition.mjs](src/nutrition.mjs)。

## 调用流程

```text
开发者在本机配置 Token
  → npm run sync
  → initialize / notifications/initialized
  → tools/list（支持分页，查找 list-nutrition-foods）
  → tools/call { name: "list-nutrition-foods", arguments: {} }
  → 解析结构化 JSON / content[].text 内的紧凑表格
  → 校验 productName / energyKcal / protein / sodium
  → 去重、冲突检查、生成基于内容的题库版本
  → 原子替换 web/data/nutrition.json
  → 网页出题、判分、导出卡片
```

本次官方实时响应已由解析器成功处理，单元测试另用虚构夹具覆盖紧凑表格、JSON 包装、重复餐品、缺失值和单位错误，确保同步失败时不会污染现有题库。

同步器固定官方 HTTPS 地址，禁止重定向，Token 只放鉴权请求头，不允许从网页或 URL 查询传入。每次请求超时 20 秒、限制响应 4 MB；401/403、429、协议错误均停止，由用户修正后手动重试。

## 数据处理

- `energyKcal` 使用 kcal，`protein` 使用 g，`sodium` 使用 mg；不把 `energyKj` 当千卡。缺失值不当成 0，真实 0 可保留。
- 一份餐品规格原样保留在名称中。不同杯型、块数和份量不合并，不擅自改成每 100 克。
- 同名同值去重，同名不同值停止更新，防止默默丢失规格信息。
- 只有完整识别且能生成 7 道有效对比题时才覆盖题库；失败保留旧文件。
- 公开 JSON 仅包含来源、采集时间、版本、餐品名、稳定 ID、用于线稿的分类和三个营养值；不包含完整工具响应、会员信息或 Token。
- 本机调用收据仅记录端点、Tool、数量、时间与版本，不公开、不含凭证。

## Skill 与业务价值

[mcblind Skill](.agents/skills/mcblind/SKILL.md) 将相同题库转为对话游戏：逐题出题 → 等用户选择 → 用精确数值判分 → 最终复盘。网页用同一份算法，不需要每个玩家都持有官方账号。

这让 MCP 数据从「查表」变成低门槛的互动学习：先做一个直觉判断，再用来源明确的数值纠正印象。相同种子与数据版本的分享链接能够复现相同题目；题库更换时页面提示不可直接比较旧版本成绩。

不使用 `create-order`、领券、积分兑换或任何其他写操作，也不查询地址、个人订单或券包。项目不提供个体饮食方案，不评判单一食物是否健康。

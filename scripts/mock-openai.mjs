// M2 穿刺用 · OpenAI 兼容 mock 网关（扮演「内网模型网关」）
// 行为：第一轮（无 tool 消息）→ 返回一个 tool_call（workspace_anchor）；
//       第二轮（有 tool 消息）→ 返回带标记的文本回复。
// 支持 stream:true（SSE）与非流式两种请求；把每次请求的关键事实打到 stderr 供断言。
// 用法：node scripts/mock-openai.mjs   （PORT 默认 8300）
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT ?? 8300)
const MARK = 'INTERNAL-GATEWAY-OK'

function replyBody(messages) {
  const hasTool = messages.some((m) => m.role === 'tool')
  if (!hasTool) {
    return {
      finish: 'tool_calls',
      toolCalls: [{ id: 'call_mock_1', name: 'workspace_anchor', arguments: '{"file":"dim_taxpayer.model"}' }],
    }
  }
  return { finish: 'stop', text: `pong · ${MARK} · 工具结果已收到` }
}

function asJson(payload, model) {
  const r = replyBody(payload.messages ?? [])
  if (r.toolCalls) {
    return {
      id: 'chatcmpl-mock', object: 'chat.completion', created: Date.now(), model,
      choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
  }
  return {
    id: 'chatcmpl-mock', object: 'chat.completion', created: Date.now(), model,
    choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

function asSse(res, payload, model) {
  const r = replyBody(payload.messages ?? [])
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const chunk = (delta, finish) => JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion.chunk', created: Date.now(), model, choices: [{ index: 0, delta, finish_reason: finish }] })
  if (r.toolCalls) {
    res.write(`data: ${chunk({ role: 'assistant' }, null)}\n\n`)
    res.write(`data: ${chunk({ tool_calls: [{ index: 0, id: 'call_mock_1', type: 'function', function: { name: 'workspace_anchor', arguments: '' } }] }, null)}\n\n`)
    // OpenAI 流式允许把 arguments 分片；整片一次给也算合法
    res.write(`data: ${chunk({ tool_calls: [{ index: 0, function: { arguments: '{"file":"dim_taxpayer.model"}' } }] }, null)}\n\n`)
    res.write(`data: ${chunk({}, 'tool_calls')}\n\n`)
  } else {
    res.write(`data: ${chunk({ role: 'assistant', content: r.text }, null)}\n\n`)
    res.write(`data: ${chunk({}, 'stop')}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.replace(/\?.*$/, '').endsWith('/chat/completions')) {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => {
      const payload = JSON.parse(s || '{}')
      console.error(JSON.stringify({
        seen: '/chat/completions',
        auth: req.headers.authorization ?? null,
        model: payload.model ?? null,
        stream: !!payload.stream,
        tools: Array.isArray(payload.tools) ? payload.tools.length : 0,
        hasToolMsg: (payload.messages ?? []).some((m) => m.role === 'tool'),
      }))
      if (payload.stream) return asSse(res, payload, payload.model)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(asJson(payload, payload.model)))
    })
    return
  }
  res.writeHead(404).end('not found')
})
server.listen(PORT, () => console.error(`[mock-openai] listening :${PORT} · marker=${MARK}`))

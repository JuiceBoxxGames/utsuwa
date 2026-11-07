// Mock provider (no CORS, like Together or LM Studio with CORS off) plus a
// result listener for the desktop probe. Throwaway, never merged.
import http from 'node:http';
import fs from 'node:fs';

const OUT = process.env.PROBE_OUT || 'probe-results.json';
const KEYS = process.env.PROBE_KEYS ? JSON.parse(fs.readFileSync(process.env.PROBE_KEYS, 'utf8')) : {};
const HELLO = process.env.PROBE_HELLO_WAV ? fs.readFileSync(process.env.PROBE_HELLO_WAV) : null;
const stats = { aborts: 0, lastAbortAfterMs: null };

function wav(seconds = 0.5, rate = 16000) {
  const n = Math.floor(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2);
  return buf;
}
const chunk = (delta, extra = {}) =>
  `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, ...extra }] })}\n\n`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const body = (req) => new Promise((r) => { const parts = []; req.on('data', (d) => parts.push(d)); req.on('end', () => r(Buffer.concat(parts))); });

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(404); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const raw = await body(req);
  const p = url.pathname;

  if (p === '/v1/_origin') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ origin: req.headers.origin ?? null })); }
  if (p === '/v1/_stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(stats)); }
  if (p === '/v1/models' || p === '/api/v0/models') {
    // Raw UTF-8 bytes in a header value: plugin-http before 2.8.3 threw on this
    res.setHeader('x-note', Buffer.from('café ✓', 'utf8').toString('latin1'));
    res.writeHead(p === '/v1/models' ? 200 : 404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'mock-a' }, { id: 'mock-b' }] }));
  }
  if (p === '/v1/chat/completions') {
    const reqBody = JSON.parse(raw.toString() || '{}');
    const model = reqBody.model;
    if (model === 'unauth') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Invalid API key: mock"}}'); }
    if (model === 'json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }] })); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (model === 'err') { res.write(chunk({ content: 'Hi' })); res.write(`data: ${JSON.stringify({ error: { message: 'overloaded', code: 529 } })}\n\n`); return res.end(); }
    if (model === 'abort') {
      const t0 = Date.now(); let closed = false;
      res.on('close', () => { if (!res.writableEnded) { closed = true; stats.aborts++; stats.lastAbortAfterMs = Date.now() - t0; } });
      for (let i = 0; i < 50 && !closed; i++) { res.write(chunk({ content: `t${i} ` })); await sleep(200); }
      return res.end();
    }
    // 'slow': reasoning, then text 250 ms apart, then a split tool call
    for (const r of ['think ', 'more']) { res.write(chunk({ reasoning_content: r })); await sleep(150); }
    for (const t of ['Hello ', 'world ', 'from ', 'the ', 'mock']) { res.write(chunk({ content: t })); await sleep(250); }
    res.write(chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'speak_segment', arguments: '{"text":' } }] }));
    res.write(chunk({ tool_calls: [{ index: 0, function: { arguments: '"hey"}' } }] }));
    res.write(chunk({}, { finish_reason: 'tool_calls' }));
    return res.end('data: [DONE]\n\n');
  }
  if (p === '/v1/audio/speech' || p.startsWith('/el/text-to-speech/') || p === '/v1/preview') {
    const audio = wav(0.5); res.writeHead(200, { 'content-type': 'audio/wav' });
    for (let i = 0; i < audio.length; i += 4096) { res.write(audio.subarray(i, i + 4096)); await sleep(20); }
    return res.end();
  }
  if (p === '/v1/audio/transcriptions' || p === '/v1/voices/clone') {
    const text = raw.toString('latin1');
    const file = /filename="([^"]+)"/.exec(text)?.[1];
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ text: `bytes=${raw.length} file=${file}`, ok: true }));
  }
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/v1/voices') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"clones":[]}'); }
  if (p.startsWith('/v1/voices/clone/')) { res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end();
}).listen(8787, '127.0.0.1');

const results = [];
http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const raw = await body(req);
  if (req.url === '/config') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ keys: KEYS, os: process.platform })); }
  if (req.url === '/hello.wav' && HELLO) { res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(HELLO); }
  if (req.url === '/result') {
    const r = JSON.parse(raw.toString());
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.ok ? JSON.stringify(r.detail ?? '') : r.error}`.slice(0, 400));
    fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  }
  if (req.url === '/done') { console.log('PROBE DONE'); fs.writeFileSync(OUT + '.done', ''); }
  res.writeHead(204); res.end();
}).listen(5987, '127.0.0.1');
console.log('mock on 8787, listener on 5987');

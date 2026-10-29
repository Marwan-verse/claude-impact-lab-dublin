import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateTensorxHandover } from '../backend/tensorx.mjs';

test('rejects absent or whitespace credentials and model before transport', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('should not call'); };
  for (const [apiKey, model] of [['', 'model'], ['   ', 'model'], ['key', ''], ['key', '  '], [null, 'model'], ['key', undefined]]) {
    await assert.rejects(generateTensorxHandover({ apiKey, model, fetchImpl }), /required/i);
  }
  assert.equal(called, false);
});

test('sanitizes HTTP failures without exposing provider response, key, or notes', async () => {
  const secrets = ['private-key', 'private-notes', 'provider-private-body'];
  const fetchImpl = async () => new Response(secrets.join(' '), { status: 401 });
  await assert.rejects(generateTensorxHandover({ apiKey: secrets[0], model: 'model', notes: secrets[1], fetchImpl }), error => {
    assert.match(error.message, /401/);
    for (const secret of secrets) assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test('rejects malformed and empty responses and transport failures without leaking details', async () => {
  const secrets = 'private-key private-notes provider-private-body';
  const transports = [
    async () => { throw new Error(secrets); },
    async () => new Response(secrets, { status: 200 }),
    async () => new Response(JSON.stringify({ choices: [] })),
    async () => new Response(JSON.stringify({ choices: [{ message: { content: '  ' } }] })),
    async () => new Response(JSON.stringify({ choices: [{ message: { content: [{ text: 'not a string' }] } }] })),
  ];
  for (const fetchImpl of transports) {
    await assert.rejects(generateTensorxHandover({ apiKey: 'private-key', model: 'model', notes: 'private-notes', fetchImpl }), error => {
      for (const secret of secrets.split(' ')) assert.equal(error.message.includes(secret), false);
      assert.match(error.message, /TensorX/);
      return true;
    });
  }
});

test('times out and aborts even when transport or response body stalls', async () => {
  for (const stage of ['fetch', 'body']) {
    let signal;
    const fetchImpl = async (_url, options) => {
      signal = options.signal;
      if (stage === 'fetch') return new Promise(() => {});
      return new Response(new ReadableStream({ start() {} }), { status: 200 });
    };
    let watchdog;
    try {
      await assert.rejects(Promise.race([
        generateTensorxHandover({ apiKey: 'key', model: 'model', fetchImpl, timeoutMs: 15 }),
        new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('watchdog expired')), 300); }),
      ]), /TensorX.*timed out/i);
      assert.equal(signal.aborted, true);
    } finally {
      clearTimeout(watchdog);
    }
  }
});

test('sends an explicit model and untrusted context to TensorX and labels the result', async () => {
  const context = { branch: 'main', tasks: ['finish tests'] };
  const notes = 'Keep the evening free.';
  let request;
  const result = await generateTensorxHandover({
    context, notes, apiKey: 'test-key', model: 'available-model',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Next: finish tests.' } }] }), { status: 200 });
    },
  });
  assert.equal(result, 'TensorX interpretation:\nNext: finish tests.');
  assert.equal(request.url, 'https://api.tensorx.ai/v1/chat/completions');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'available-model');
  assert.equal(body.max_tokens, 1024);
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /untrusted/i);
  assert.match(body.messages[0].content, /evidence/i);
  assert.match(body.messages[0].content, /infer/i);
  assert.equal(body.messages[1].role, 'user');
  assert.equal(body.messages[1].content, JSON.stringify({ context, notes }));
});

for (const status of [307, 308]) {
  test(`rejects TensorX HTTP ${status} redirects without forwarding sensitive data`, async (t) => {
    const received = [];
    const destination = http.createServer(async (req, res) => {
      const request = { body: '' };
      received.push(request);
      for await (const chunk of req) request.body += chunk;
      res.end(JSON.stringify({ choices: [{ message: { content: 'unexpected' } }] }));
    });
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve));
    t.after(() => { destination.closeAllConnections(); return new Promise(resolve => destination.close(resolve)); });
    let initialBody = '';
    const initial = http.createServer(async (req, res) => {
      for await (const chunk of req) initialBody += chunk;
      res.writeHead(status, { location: `http://127.0.0.1:${destination.address().port}/redirected` });
      res.end();
    });
    await new Promise(resolve => initial.listen(0, '127.0.0.1', resolve));
    t.after(() => { initial.closeAllConnections(); return new Promise(resolve => initial.close(resolve)); });
    let options;
    let failure;
    try {
      await generateTensorxHandover({
        context: { privateMetadata: 'sensitive-metadata' }, notes: 'sensitive-notes',
        apiKey: 'synthetic-key', model: 'test-model', workspaceId: 'synthetic-workspace',
        fetchImpl: (url, requestOptions) => {
          assert.equal(url, 'https://api.tensorx.ai/v1/chat/completions');
          options = requestOptions;
          return fetch(`http://127.0.0.1:${initial.address().port}/`, requestOptions);
        },
      });
    } catch (error) { failure = error; }
    assert.match(initialBody, /sensitive-metadata/);
    assert.match(initialBody, /sensitive-notes/);
    assert.deepEqual(received, [], 'redirect destination must receive no request or body');
    assert.equal(options.redirect, 'error');
    assert.ok(failure, 'redirect must reject the request');
    assert.match(failure.message, /TensorX request failed/);
    assert.doesNotMatch(failure.message, /synthetic-key|synthetic-workspace|sensitive-metadata|sensitive-notes/);
  });
}

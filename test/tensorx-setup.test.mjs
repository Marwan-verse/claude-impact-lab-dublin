import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
const match = readme.match(/python3 - <<'PY'\n([\s\S]*?)\nPY/);
assert.ok(match, 'README must contain the Python model discovery snippet');
const snippet = match[1];
const dummyKey = 'test-key-not-a-real-credential';

// Run the actual README code, replacing only its network transport. Deny all
// real sockets so even a broken implementation cannot contact any host.
const harness = String.raw`
import http.client
import io
import json
import os
import socket
import sys
import urllib.request

calls = []
class Response(io.BytesIO):
    status = int(os.environ['TEST_STATUS'])
    def __init__(self):
        super().__init__(json.dumps({'data': [{'id': 'model-a'}, {'id': 'model-b'}], 'secret': 'upstream-body-must-not-be-printed'}).encode())
    def getheader(self, name, default=None):
        return os.environ['TEST_LOCATION'] if name.lower() == 'location' else default

class Connection:
    def __init__(self, host, timeout=None, **kwargs):
        calls.append({'host': host, 'timeout': timeout})
    def request(self, method, path, body=None, headers=None, **kwargs):
        calls[-1].update(method=method, path=path, headers=headers)
    def getresponse(self):
        return Response()
    def close(self):
        pass

def forbidden(*args, **kwargs):
    raise RuntimeError('unexpected redirect-following or network transport')
http.client.HTTPSConnection = Connection
http.client.HTTPConnection = forbidden
urllib.request.urlopen = forbidden
socket.socket.connect = forbidden
try:
    exec(compile(sys.stdin.read(), 'README model discovery', 'exec'), {'__name__': '__main__'})
finally:
    with open(os.environ['TEST_CALLS_FILE'], 'w') as output:
        json.dump(calls, output)
`;

function runDiscovery(status, location = 'https://alternate.invalid/steal') {
  const directory = mkdtempSync(join(tmpdir(), 'tensorx-setup-test-'));
  const callsFile = join(directory, 'calls.json');
  try {
    const result = spawnSync('python3', ['-c', harness], {
      input: snippet,
      encoding: 'utf8',
      env: { ...process.env, TENSORX_API_KEY: dummyKey, TEST_STATUS: String(status), TEST_CALLS_FILE: callsFile, TEST_LOCATION: location },
    });
    assert.ifError(result.error);
    return { ...result, calls: JSON.parse(readFileSync(callsFile, 'utf8')) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('README discovery prints only model IDs on HTTP 200', () => {
  const result = runDiscovery(200);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'model-a\nmodel-b\n');
  assert.equal(result.stderr, '');
  assert.deepEqual(result.calls, [{
    host: 'api.tensorx.ai', timeout: 30, method: 'GET', path: '/v1/models',
    headers: { Authorization: `Bearer ${dummyKey}` },
  }]);
});

for (const [status, location] of [
  [302, 'https://alternate.invalid/steal'],
  [302, 'http://api.tensorx.ai/steal'],
  [401, 'https://alternate.invalid/steal'],
]) {
  test(`README discovery rejects HTTP ${status} with location ${location}`, () => {
    const result = runDiscovery(status, location);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `HTTP ${status}\n`);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(dummyKey));
    assert.deepEqual(result.calls, [{
      host: 'api.tensorx.ai', timeout: 30, method: 'GET', path: '/v1/models',
      headers: { Authorization: `Bearer ${dummyKey}` },
    }]);
  });
}

import assert from 'node:assert/strict';

process.env.API_SECRET = 'test-relay-secret';
process.env.ADMIN_PASSWORD = 'test-admin';

const { default: handler } = await import('../api/pair.js?test=auto-registration');

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function call(method, body = {}, headers = {}, query = {}) {
  const req = { method, body, headers, query };
  const res = mockResponse();
  await handler(req, res);
  return res;
}

const registration = await call('POST', {
  action: 'register_bot', botId: 'skylar-test', bot: 'SKYLAR XD', serverId: 'muzan-test', port: '25566', capabilities: ['pairing']
}, { 'x-bot-registration-secret': 'test-relay-secret' });
assert.equal(registration.statusCode, 200);
assert.equal(registration.body.registered, true);

const status = await call('GET', {}, {}, { stats: '1' });
assert.equal(status.body.status, 'online');
assert.equal(status.body.activeBot.botId, 'skylar-test');

const queued = await call('POST', { phone: '254712345678', botType: 'skylar' });
assert.equal(queued.statusCode, 202);
assert.equal(queued.body.status, 'pending');

const claimed = await call('POST', { action: 'poll_job', botId: 'skylar-test' }, { 'x-bot-registration-secret': 'test-relay-secret' });
assert.equal(claimed.body.job.status, 'claimed');
assert.equal(claimed.body.job.phone, '254712345678');

const delivered = await call('POST', { action: 'job_result', botId: 'skylar-test', jobId: claimed.body.job.id, status: 'ready', code: 'ABCD-EFGH', rawCode: 'ABCDEFGH' }, { 'x-bot-registration-secret': 'test-relay-secret' });
assert.equal(delivered.statusCode, 200);

const result = await call('GET', {}, {}, { requestId: claimed.body.job.id });
assert.equal(result.statusCode, 200);
assert.equal(result.body.pairing.code, 'ABCD-EFGH');

console.log('Skylar automatic registration test: OK');

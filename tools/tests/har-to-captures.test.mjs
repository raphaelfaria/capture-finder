// Unit tests for tools/har-to-captures.mjs (node --test).
import assert from 'node:assert/strict';
import test from 'node:test';
import { FIELDS, extract, factsOnly, pick } from '../har-to-captures.mjs';

const entry = (url, body, { base64 = false, method = 'GET' } = {}) => {
  const text = JSON.stringify(body);
  return { request: { method, url }, response: { content: base64 ? { text: Buffer.from(text).toString('base64'), encoding: 'base64' } : { text } } };
};
const page = (n, data, total = 3) => ({ requestId: 'r', type: 'neuralCapture', numberOfResults: total, data, numberOfPages: 2, page: n, size: 2 });

test('joins list pages, sorted by name, copying only whitelisted fields', () => {
  const a = { productId: 'b', name: 'Beta', createdAt: '2025-01-01', metadata: { deviceType: 'amp_head', gainType: 4, secret: 1 }, authorImageUri: 'https://x', authorId: 'u1' };
  const b = { productId: 'a', name: 'alpha', liked: false, starred: true, downloadState: 'downloaded', published: true };
  const { captures, stats } = extract({ log: { entries: [
    entry('https://cloud-api.neuraldsp.com/api/v1/users/NeuralDSP', { username: 'NeuralDSP' }),
    entry('https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=0', page(0, [a])),
    entry('https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=1', page(1, [b])),
    { request: { method: 'OPTIONS', url: 'https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=1' }, response: { content: {} } },
  ] } });
  assert.deepEqual(captures, [{ productId: 'a', name: 'alpha', published: true }, { productId: 'b', name: 'Beta', metadata: { deviceType: 'amp_head', gainType: 4 } }]);
  assert.deepEqual([...stats.dropped].sort(), ['authorId', 'authorImageUri', 'createdAt', 'downloadState', 'liked', 'metadata.secret', 'starred']);
  assert.deepEqual([...stats.pages], [0, 1]);
  assert.equal(stats.reported, 3);
  assert.equal(stats.listResponses, 2);
});

test('detail responses (base64 too) are merged into the listed record, winning over list values', () => {
  const { captures, stats } = extract({ log: { entries: [
    entry('https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=0', { page: 0, products: [{ id: 'c1', type: 'neural_capture', name: 'Blue', description: 'short', metadata: { gainType: 5 } }] }),
    entry('https://cloud-api.neuraldsp.com/api/v1/products/c1', { id: 'c1', name: 'Blue', description: 'Full detail', metadata: { version: 2, gainType: 7 }, extra: { source: 'detail' } }, { base64: true }),
  ] } });
  assert.equal(stats.detailMatches, 1);
  assert.deepEqual(captures[0], { id: 'c1', name: 'Blue', description: 'Full detail', type: 'neural_capture', metadata: { gainType: 7, version: 2 } });
});

test('a repeated record is merged and empty values never erase data', () => {
  const { captures } = extract({ log: { entries: [
    entry('https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=0', page(0, [{ productId: 'x', name: 'X', description: 'Settings:\nGain: 5' }])),
    entry('https://cloud-api.neuraldsp.com/search/v1/for/neuralCapture?page=0', page(0, [{ productId: 'x', name: 'X', description: '', tags: ['t'] }])),
  ] } });
  assert.deepEqual(captures, [{ productId: 'x', name: 'X', description: 'Settings:\nGain: 5', tags: ['t'] }]);
});

test('no user-state or identity fields are on the whitelist', () => {
  for (const f of ['liked', 'starred', 'downloadState', 'previousDownloadState', 'authorId', 'authorImageUri', 'email', 'userId']) assert.ok(!FIELDS.includes(f), f);
  assert.deepEqual(pick({ name: 'x', user: { email: 'a@b' } }), { name: 'x' });
});

test('descriptions keep their gear and settings lines, not stock header lines', () => {
  assert.equal(factsOnly('Quad Cortex Factory Captures\n\nThis is a capture of X® amp.\n\nSettings:\nGain: 5'), 'This is a capture of X® amp.\n\nSettings:\nGain: 5');
  assert.equal(factsOnly('‘Quad Cortex Factory Captures\n\nSettings:\nGain: 5'), 'Settings:\nGain: 5');
  assert.deepEqual(pick({ name: 'x', description: 'Quad Cortex Factory Captures\nGain: 5' }), { name: 'x', description: 'Gain: 5' });
});

test('an empty HAR has no captures', () => {
  assert.deepEqual(extract({ log: { entries: [] } }).captures, []);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Signer } from '@atc-web/atc-service-core/http';
import { SearchError } from '../src/domain/errors.js';
import { ContentSync } from '../src/sync/content-sync.js';
import { testService } from './helpers.js';

const SECRET = 's'.repeat(40);
/** A stand-in for atc-content: releases of namespace "shop". */
function content() {
  /** @type {string[]} */ const asked = [];
  const releases = {
    1: { keys: { 'cart.title': { description: 'Cart heading', values: { tr: 'Sepetiniz', en: 'Your cart' } }, 'cart.empty': { description: '', values: { tr: 'Sepetiniz boş', en: '' } } } },
    2: { keys: { 'cart.title': { description: 'Cart heading', values: { tr: 'Alışveriş sepetiniz', en: 'Shopping cart' } } } },
  };
  const fetchImpl = /** @type {typeof fetch} */ (async (url, init) => {
    const u = new URL(String(url));
    asked.push(`${u.pathname}${u.search} ${new Headers(init?.headers).get('authorization')}`);
    if (u.pathname === '/v1/namespaces/shop/releases') return Response.json({ items: [{ number: 2 }], nextBefore: null });
    const m = /^\/v1\/namespaces\/shop\/releases\/(\d+)$/.exec(u.pathname);
    if (m && /** @type {any} */ (releases)[m[1]]) return Response.json({ release: { number: Number(m[1]), content: { defaultLocale: 'tr', locales: [], ...(/** @type {any} */ (releases)[m[1]]) } } });
    return Response.json({ error: { code: 'NAMESPACE_NOT_FOUND', message: 'no such namespace' } }, { status: 404 });
  });
  return { asked, fetchImpl };
}

test('content sync: a release becomes one document per key and locale, replacing the previous one; Turkish stemming on', async () => {
  const { service } = testService();
  const c = content();
  const sync = new ContentSync({ service, target: { url: 'http://content.test', apiKey: 'k'.repeat(40), timeoutMs: 1000, prefix: 'content-', language: 'tr' }, hookSecret: SECRET, fetch: c.fetchImpl });
  const first = await sync.sync('shop', 1);
  assert.deepEqual(first, { index: 'content-shop', release: 1, removed: 0, indexed: 3 }, 'empty values are skipped');
  assert.equal(service.getIndex('content-shop').language, 'tr');
  assert.deepEqual(service.search('content-shop', { q: 'sepet', filters: { locale: ['tr'] } }).items.map((h) => h.id).sort(), ['tr:cart.empty', 'tr:cart.title'], 'stemmed: "sepet" finds "Sepetiniz"');
  const doc = service.getDocument('content-shop', 'tr:cart.title');
  assert.deepEqual([doc.title, doc.body, JSON.parse(doc.attrs).key], ['Sepetiniz', 'Cart heading', 'cart.title']);
  const latest = await sync.sync('shop');
  assert.deepEqual([latest.release, latest.removed, latest.indexed], [2, 3, 2], 'no number: the newest release; the index holds only that release');
  assert.match(c.asked[0], /Bearer k{40}$/);
  await assert.rejects(sync.sync('nope'), (e) => e instanceof SearchError && e.code === 'NAMESPACE_NOT_FOUND');
  assert.deepEqual(sync.counts, { ok: 2, failed: 1, ignored: 0 });
});

test('content sync hook: signed deliveries of release events sync, others are ignored, bad signatures refused', async () => {
  const { service } = testService();
  const sync = new ContentSync({ service, target: { url: 'http://content.test', apiKey: 'k'.repeat(40), timeoutMs: 1000, prefix: 'content-', language: 'none' }, hookSecret: SECRET, fetch: content().fetchImpl });
  const body = JSON.stringify({ id: 'evt_1', type: 'content.release.published', source: 'atc-content', data: { namespace: 'shop', release: 1 } });
  const sig = Signer.sign(body, Math.floor(Date.now() / 1000), [SECRET]);
  assert.deepEqual(await sync.receive(body, sig), { outcome: 'synced', index: 'content-shop', release: 1, removed: 0, indexed: 3 });
  const other = JSON.stringify({ type: 'flag.changed', data: {} });
  assert.deepEqual(await sync.receive(other, Signer.sign(other, Math.floor(Date.now() / 1000), [SECRET])), { outcome: 'ignored' });
  await assert.rejects(sync.receive(body, sig.replace(/.$/, '0')), (e) => e instanceof SearchError && e.code === 'INVALID_SIGNATURE');
  const off = new ContentSync({ service, target: { url: 'http://content.test', apiKey: 'k'.repeat(40), timeoutMs: 1000, prefix: 'content-', language: 'none' }, hookSecret: null });
  await assert.rejects(off.receive(body, sig), (e) => e instanceof SearchError && e.code === 'HOOK_DISABLED');
});

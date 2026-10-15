import { Signer } from '@atc-web/atc-service-core/http';
import { SearchError } from '../domain/errors.js';

/**
 * Mirrors published atc-content releases into search: one index per namespace
 * (`<prefix><namespace>`), one document per key and locale, the translated text as title, the
 * key's description as body, `namespace`/`locale`/`key` as attributes. Driven by
 * `content.release.published` / `content.release.rolled_back` events from atc-webhook-out, or
 * on demand. Each sync replaces the index's documents with the release's content.
 */
export class ContentSync {
  static EVENTS = new Set(['content.release.published', 'content.release.rolled_back']);

  /**
   * @param {object} o
   * @param {import('../domain/search-service.js').SearchService} o.service
   * @param {{ url: string, apiKey: string, timeoutMs: number, prefix: string, language: 'none'|'tr' }} o.target
   * @param {string|null} o.hookSecret
   * @param {typeof fetch} [o.fetch]
   * @param {() => number} [o.now]
   */
  constructor({ service, target, hookSecret, fetch: fetchImpl = fetch, now = Date.now }) {
    this.service = service;
    this.target = target;
    this.hookSecret = hookSecret;
    this.fetch = fetchImpl;
    this.now = now;
    /** @type {Record<'ok'|'failed'|'ignored', number>} */
    this.counts = { ok: 0, failed: 0, ignored: 0 };
  }

  /** @param {string} path */
  async #get(path) {
    const res = await this.fetch(`${this.target.url}${path}`, { headers: { authorization: `Bearer ${this.target.apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(this.target.timeoutMs) });
    const body = /** @type {any} */ (await res.json().catch(() => null));
    if (!res.ok) throw new SearchError(res.status === 404 ? 'NAMESPACE_NOT_FOUND' : 'UPSTREAM_FAILED', `atc-content answered ${res.status}: ${body?.error?.message ?? ''}`.trim());
    return body;
  }

  /**
   * Mirror one release (the newest when `release` is omitted).
   * @param {string} namespace @param {number} [release]
   */
  async sync(namespace, release) {
    if (!/^[a-z0-9]+([.\-_][a-z0-9]+)*$/.test(namespace)) throw new SearchError('INVALID_QUERY', 'not a namespace name');
    try {
      const ns = encodeURIComponent(namespace);
      const number = release ?? (await this.#get(`/v1/namespaces/${ns}/releases?limit=1`)).items?.[0]?.number;
      if (!number) throw new SearchError('INVALID_QUERY', `namespace "${namespace}" has no published release yet`);
      const { content } = (await this.#get(`/v1/namespaces/${ns}/releases/${number}`)).release;
      /** @type {import('../types.js').DocumentInput[]} */
      const docs = [];
      for (const [key, k] of Object.entries(/** @type {Record<string, { description: string, values: Record<string, string> }>} */ (content.keys))) {
        for (const [locale, value] of Object.entries(k.values)) {
          if (!value.trim()) continue;
          docs.push({ id: `${locale}:${key}`.slice(0, 200), title: value, body: k.description ?? '', tags: [locale], attrs: { namespace, locale, key } });
        }
      }
      const index = `${this.target.prefix}${namespace}`;
      const r = this.service.replaceIndex(index, docs, 'atc-content', { description: `Published content of "${namespace}" (atc-content)`, facets: ['locale'], language: this.target.language });
      this.counts.ok++;
      return { index, release: Number(number), ...r };
    } catch (err) {
      this.counts.failed++;
      throw err;
    }
  }

  /**
   * A delivery from atc-webhook-out, signed over the raw body.
   * @param {string} raw @param {string|undefined} signature
   */
  async receive(raw, signature) {
    if (!this.hookSecret) throw new SearchError('HOOK_DISABLED', 'SYNC_HOOK_SECRET is not set; the hook is off');
    if (!signature || !Signer.verify([this.hookSecret], raw, signature, { now: this.now() })) throw new SearchError('INVALID_SIGNATURE', 'signature does not match');
    /** @type {any} */ let event;
    try { event = JSON.parse(raw); } catch { throw new SearchError('INVALID_QUERY', 'body is not JSON'); }
    if (!ContentSync.EVENTS.has(String(event?.type)) || typeof event?.data?.namespace !== 'string') { this.counts.ignored++; return { outcome: 'ignored' }; }
    const r = await this.sync(event.data.namespace, Number.isInteger(event.data.release) ? event.data.release : undefined);
    return { outcome: 'synced', ...r };
  }
}

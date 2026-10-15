import { ConfigError, EnvReader, parseApiKeys, parseAudit } from '@atc-web/atc-service-core/config';

/** @typedef {import('./types.js').ApiKey} ApiKey */
/** @typedef {import('./types.js').KeyRole} KeyRole */

export { ConfigError };

/** Validated service configuration. Build with {@link Config.fromEnv}. */
export class Config {
  static MIN_SECRET_LENGTH = 32;
  static INDEX_PATTERN = /^[a-z0-9]+([.\-_][a-z0-9]+)*$/;
  static ROLES = ['read', 'write', 'readwrite'];

  /** @param {import('./types.js').ConfigValues} v */
  constructor(v) {
    this.port = v.port;
    this.host = v.host;
    this.logLevel = v.logLevel;
    this.trustProxy = v.trustProxy;
    this.tls = v.tls;
    this.audit = v.audit;
    this.bodyLimit = v.bodyLimit;
    this.dbPath = v.dbPath;
    this.dbBackupDir = v.dbBackupDir;
    this.apiKeys = v.apiKeys;
    this.rateLimitMax = v.rateLimitMax;
    this.maxBatch = v.maxBatch;
    this.maxDocBytes = v.maxDocBytes;
    this.maxAttrs = v.maxAttrs;
    this.maxPage = v.maxPage;
    this.maxOffset = v.maxOffset;
    this.maxFacetValues = v.maxFacetValues;
    this.contentSync = v.contentSync;
    this.syncHookSecret = v.syncHookSecret;
    Object.freeze(this);
  }

  /**
   * @param {NodeJS.ProcessEnv} [env]
   * @returns {Config}
   */
  /** @param {EnvReader} r */
  static #contentSync(r) {
    const url = r.optional('CONTENT_URL').replace(/\/+$/, '');
    const apiKey = r.optional('CONTENT_API_KEY');
    if (Boolean(url) !== Boolean(apiKey)) throw new ConfigError('CONTENT_URL and CONTENT_API_KEY must be set together');
    if (!url) return null;
    if (!/^https?:\/\/[^\s]+$/.test(url)) throw new ConfigError('CONTENT_URL must be an absolute http(s) URL');
    const prefix = r.optional('CONTENT_INDEX_PREFIX') || 'content-';
    if (!/^[a-z0-9]+([.\-_][a-z0-9]+)*[.\-_]?$/.test(prefix)) throw new ConfigError('CONTENT_INDEX_PREFIX must be lower-case letters, digits and . - _');
    const language = r.optional('CONTENT_INDEX_LANGUAGE') || 'tr';
    if (language !== 'none' && language !== 'tr') throw new ConfigError('CONTENT_INDEX_LANGUAGE must be none or tr');
    return { url, apiKey, timeoutMs: r.integer('CONTENT_TIMEOUT_MS', 10_000, { min: 500 }), prefix, language: /** @type {'none'|'tr'} */ (language) };
  }

  /** @param {string} value */
  static #hookSecret(value) {
    if (!value) return null;
    if (value.length < Config.MIN_SECRET_LENGTH) throw new ConfigError(`SYNC_HOOK_SECRET must be at least ${Config.MIN_SECRET_LENGTH} characters`);
    return value;
  }

  static fromEnv(env = process.env) {
    const r = new EnvReader(env);

    const certPath = r.optional('TLS_CERT_PATH');
    const keyPath = r.optional('TLS_KEY_PATH');
    if (Boolean(certPath) !== Boolean(keyPath)) throw new ConfigError('TLS_CERT_PATH and TLS_KEY_PATH must be set together');

    return new Config({
      port: r.integer('PORT', 3010, { min: 0, max: 65535 }),
      host: r.optional('HOST') || '0.0.0.0',
      logLevel: r.optional('LOG_LEVEL') || 'info',
      trustProxy: r.boolean('TRUST_PROXY', false),
      tls: certPath ? { certPath, keyPath } : null,
      audit: parseAudit(r),
      bodyLimit: r.integer('BODY_LIMIT', 8_388_608, { min: 1_024 }),
      dbPath: r.optional('DB_PATH') || './data/search.db',
      dbBackupDir: r.optional('DB_BACKUP_DIR') || undefined,
      apiKeys: Config.#parseApiKeys(r.required('SEARCH_API_KEYS')),
      rateLimitMax: r.integer('RATE_LIMIT_MAX', 1_200, { min: 1 }),
      maxBatch: r.integer('MAX_BATCH', 500, { min: 1, max: 10_000 }),
      maxDocBytes: r.integer('MAX_DOC_BYTES', 65_536, { min: 256 }),
      maxAttrs: r.integer('MAX_ATTRS', 50, { min: 1, max: 500 }),
      maxPage: r.integer('MAX_PAGE', 100, { min: 1, max: 1_000 }),
      maxOffset: r.integer('MAX_OFFSET', 10_000, { min: 0 }),
      maxFacetValues: r.integer('MAX_FACET_VALUES', 20, { min: 1, max: 200 }),
      contentSync: Config.#contentSync(r),
      syncHookSecret: Config.#hookSecret(r.optional('SYNC_HOOK_SECRET')),
    });
  }

  /**
   * Parse `id:secret[:role[:index+index]]`. Role defaults to `readwrite`, indexes to all. Index
   * names are not checked against existing indexes: keys may be issued before an index is created.
   * @param {string} raw
   * @returns {ApiKey[]}
   */
  static #parseApiKeys(raw) {
    return parseApiKeys(raw, 'SEARCH_API_KEYS', { roles: Config.ROLES, scopePattern: Config.INDEX_PATTERN, scopeNoun: 'index', minSecretLength: Config.MIN_SECRET_LENGTH, roleErrorMessage: () => 'must be read, write or readwrite' })
      .map(({ id, secret, role, scopes }) => ({ id, secret, role: /** @type {KeyRole} */ (role), indexes: scopes }));
  }
}

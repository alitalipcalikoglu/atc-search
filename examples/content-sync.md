# Mirror of atc-content

Search can keep one index per atc-content namespace in step with what is published, so translators and support staff can search the live strings ("which key says 'Sepetiniz'?").

## Setup

On search: `CONTENT_URL` and `CONTENT_API_KEY` (a `read` key on atc-content), optionally `CONTENT_INDEX_PREFIX` (default `content-`) and `CONTENT_INDEX_LANGUAGE` (default `tr`). For automatic updates also `SYNC_HOOK_SECRET`, and a subscription on atc-webhook-out:

```
SUBSCRIPTION_SEEDS=search-content|http://127.0.0.1:3010/v1/hooks/webhook-out|content.release.*|<SYNC_HOOK_SECRET>
```

atc-content must publish its events (`WEBHOOK_OUT_URL` + key). The stack sets all of this up.

## What happens

Publishing (or rolling back) namespace `shop` sends `content.release.published` → atc-webhook-out signs and delivers it → search fetches that release and makes `content-shop` hold exactly its strings:

| Field | Value |
|---|---|
| id | `<locale>:<key>`, e.g. `tr:cart.title` |
| title | the text in that locale |
| body | the key's description |
| attrs | `namespace`, `locale`, `key` |
| tags / facet | `locale` |

Empty values are skipped. Keys removed from the release disappear from the index. If the sync fails (content unreachable), the hook answers with an error and atc-webhook-out retries with its normal backoff.

## On demand

The first fill, or after changing the prefix:

```bash
curl -s -X POST $SEARCH/v1/sync/content/shop -H "Authorization: Bearer $KEY"
```

```json
{ "index": "content-shop", "release": 7, "removed": 0, "indexed": 412 }
```

Then search it like any index:

```bash
curl -s "$SEARCH/v1/indexes/content-shop/search?q=sepet&filter.locale=tr&highlight=true" -H "Authorization: Bearer $KEY"
```

## Pitfalls

- The mirror owns its index: documents put there by hand are removed at the next sync.
- Drafts are not mirrored, only published releases.
- `/metrics` has `search_content_sync_total{outcome}` (`ok`, `failed`, `ignored`).

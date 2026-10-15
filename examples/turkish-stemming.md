# Turkish stemming

Folding already makes "kirmizi" find "Kırmızı". An index with `language: "tr"` also strips Turkish suffixes, so the inflected forms of a word meet at one stem:

| Word | Term |
|---|---|
| kitap, kitaplar, kitapları, kitaplarımızdan, kitapta | `kitap` |
| öğretmenlerimize | `ogretmen` |
| masada | `masa` |
| evlerde | `evler` (a stem keeps three letters; type-ahead on the last word still finds it from "ev") |

```bash
curl -s -X POST $SEARCH/v1/indexes -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"name":"blog","language":"tr","facets":["tags"]}'
curl -s -X PUT $SEARCH/v1/indexes/blog/documents -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"documents":[{"id":"b1","title":"Kitaplarımızdan seçmeler","body":"Öğretmenlerimize teşekkürler."}]}'
curl -s "$SEARCH/v1/indexes/blog/search?q=kitap&highlight=true" -H "Authorization: Bearer $KEY"
```

`b1` is found and the highlight marks the word as written: `<mark>Kitaplarımızdan</mark> seçmeler`.

Switch an existing index with `PATCH /v1/indexes/blog {"language":"tr"}` (or back to `"none"`): its full-text rows are rewritten in the same transaction, no reindex from the source is needed.

## What it does and does not do

- Rule-based, no dictionary: from the end of the word it strips at most one case suffix (`-da`, `-dan`, `-ın`, `-ya`, …), one possessive (`-ımız`, `-ları`, `-sı`, …) and the plural (`-lar`/`-ler`). The dative vowel is only taken right after a possessive.
- The same rules run on documents and queries, so a rare over-stemmed word still matches its own forms; it can also bring in an unrelated word that shares the stem.
- Derivational suffixes (`-lık`, `-çı`, `-sız`) are kept: they change the meaning.
- Phrases (`"kitap seçmeler"`) and exclusions (`-kitap`) work on stems too.

Pitfalls: an index that mixes languages should stay `none`; use one index per language when that matters.

# Sūtra lookup data

`sutras.json` contains sūtra numbers, Sanskrit text and search romanization from
[Ashtadhyayi.com’s public data repository](https://github.com/ashtadhyayi-com/data),
specifically `sutraani/data.txt`, retrieved on 2026-09-29.

The source README permits reuse with appropriate credit. The in-app lookup
credits Ashtadhyayi.com and links every inserted sūtra to its source page.
Only these lookup fields are included; commentaries are not copied.

To refresh the catalog, run `node scripts/update-sutra-catalog.mjs`.

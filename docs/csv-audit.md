# Bakery sales.csv reconciliation

Audit date: 2026-11-02 (Asia/Bangkok).

Source: user-supplied `Bakery sales.csv`, 14,676,293 bytes. The original file was read without modification and is not copied into the repository.

SHA-256: `af5eede55b6eb2efb6bebb0e6dd1a51568c7eb73554d2f8ad2563081025681b2`.

## Result and limits

Independent calculations from the supplied CSV match the latest successful database/API and browser verification in this conversation, under the application's selected-product and positive-quantity filters. A fresh SQL connection timed out during this audit, including an attempt outside the sandbox, so current database rows could not be reconciled one by one against the file. These matching controls are not a claim that every current database row was re-read or that the import file's provenance was cryptographically verified.

The application reads the connected SQL database, not the Downloads CSV directly. Editing the CSV alone will not change the dashboard.

## Source scope and filters

| Measure | CSV-derived result |
| --- | ---: |
| All CSV rows | 234,005 |
| Distinct article names | 149 |
| Source date range | 2021-01-02 to 2022-09-30 |
| Rows for the 10 selected articles, including negative quantities | 139,315 |
| Rows for those articles with Quantity > 0 | 138,577 |
| Selected-article rows in 2022-08-06 to 2022-09-30, including negatives | 16,096 |
| Positive-quantity selected-article rows in that 56-day window | 16,068 |
| Negative-quantity rows excluded in that window | 28 |
| Quantity on excluded negative rows | -49 |
| Revenue on excluded negative rows | -€64.20 |

The selected articles are TRADITIONAL BAGUETTE, CROISSANT, PAIN AU CHOCOLAT, BANETTE, BAGUETTE, CEREAL BAGUETTE, SPECIAL BREAD, TARTELETTE, BOULE 400G and COOKIE. This includes only 10 of the 149 source article names. Negative quantities are excluded by the observed import/filtering scope; their business meaning was not assumed.

## Matched dashboard and model controls

| Measure | Independently from CSV | Previously verified application value |
| --- | ---: | ---: |
| Imported selected positive rows, full source period | 138,577 | 138,577 |
| Active 56-day transaction count | 16,068 | 16,068 |
| Revenue, 2022-09-03 through 2022-09-30 | €11,280.15 | €11,280.15 |
| Units, 2022-09-03 through 2022-09-30 | 8,629 | 8,629 |
| Revenue, 2022-09-24 through 2022-09-30 | €3,016.00 | €3,016.00 |
| Traditional Baguette next-day MA(7) forecast | 166.42857142857142 | 166.42857142857142 |
| Traditional Baguette one-step RMSE | 89.1235238248509 | 89.12352382485089 |
| Approximate 95% next-day upper bound | 341.10746830057667 | 341.1074683005766 |
| Traditional Baguette EOQ using database inputs below | 2,496.0775088932896 | 2,496.0775088932896 |

The 56-day positive-quantity selected-article revenue is €37,855.10. Including the 28 negative-quantity rows for the same products and dates gives €37,790.90. Thus positive-only revenue differs from the source's signed net revenue; dashboard users should retain that scope distinction.

CSV monetary strings such as `0,90 €` were parsed as decimal euros, and revenue was independently calculated as Quantity × unit_price. Daily demand was aggregated by article/date, including zero on dates without selected sales, before independently computing MA(7), one-step RMSE and the 95% prediction interval.

## Additional EOQ inputs

The CSV columns are the source index, date, time, ticket_number, article, Quantity and unit_price. It supplies sales demand and transaction selling prices. It has no unit cost, ordering cost, shelf life, lead time or annual holding-rate fields.

The checked Traditional Baguette example uses previously verified database inputs: cost €0.39/unit, ordering cost €5/order, shelf life 1 day and lead time 1 day, plus the application's 25% annual holding-rate setting. With forecast demand 166.428571 units/day, D = 60,746.428571 units/year and H = €0.0975/unit/year, EOQ is 2,496.077509 units/order. The existing shelf-life cap reduces the recommended quantity to 166 units/order. These extra inputs are not validated by the sales CSV.

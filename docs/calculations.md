# Dashboard Confidence and EOQ

Current DSS additions and evaluation design: [dss-methodology.md](dss-methodology.md). The UI now supports explicit per-product model choices, shared-date validation/test comparison, retrospective FEFO inventory policy experiments, silhouette and printable slides. `npm run demo` is an explicit synthetic, read-only mode; it never substitutes for a failed production database connection. Historical audit numbers below are not results of a fresh query.

## Data used

The dashboard reads the configured SQL Server through `/api/data`. It does not generate replacement sales or seed the shared database. Sales come from the imported database's `daily_sales` view and `sales_transactions` table within the 56-day analysis window ending before `SIM_TODAY`. Days with no sales rows are filled with zero, consistently with the existing forecasting flow.

The connected dataset was checked with 16,068 transactions across 2022-08-06 to 2022-09-30, planning date 2022-10-01. The user later supplied `Bakery sales.csv` outside this checkout. Independent file-derived counts, sales totals, the MA(7) forecast, RMSE and example EOQ match the latest successful application verification under the 10-product, positive-quantity filters. A fresh SQL connection timed out during the CSV audit, so a current row-by-row database reconciliation remains unverified. See [CSV reconciliation](csv-audit.md) for scope, controls and limits.

Costs, ordering costs, shelf life and lead time come from the database's `products` records. The annual holding rate is the user's planning setting, initially 25%. These inputs are not inferred from transaction prices and are not asserted to be present in the original sales CSV.

## Confidence / next-day prediction interval

- Forecast: the selected moving average or exponential smoothing method.
- Errors: actual minus one-step-ahead forecasts from the 56-day history, with no fitted forecast before the method has sufficient history.
- RMSE: square root of the mean squared one-step errors.
- Approximate next-day interval: `max(0, d - z × RMSE)` to `max(0, d + z × RMSE)`.
- Two-sided normal quantiles: 90% = 1.644853627; 95% = 1.959963985; 99% = 2.575829304.
- Bounds are displayed outward-rounded to whole selling units. The CSV retains six decimal places.
- The nominal confidence level is user-selected. It is not a measured forecast accuracy score.
- Measured coverage is computed chronologically: each backtest day uses RMSE from **earlier** errors only, after at least 14 prior errors. The tested day's error is added afterward. The UI reports hits / tested days and their percentage.
- The interval is approximate under normal, stable error assumptions. It is explicitly limited to the next day; the 14-day chart does not reuse it as a guaranteed interval for all future days.
- Aggregate store intervals use the sum of selected per-product forecasts and residuals against the summed daily series, preserving cross-product error correlations even when models differ.
- Prediction intervals use a separate confidence setting from the one-sided service levels used for safety stock and ROP.

Reference: [Forecasting: Principles and Practice — Prediction intervals](https://otexts.com/fpp2/prediction-intervals.html).

## EOQ and recommended order

`D = forecast daily units × 365`

`S = database order_cost (EUR/order)`

`H = database cost × annual holding rate (EUR/unit/year)`

`EOQ = sqrt(2 × D × S / H)`

The theoretical EOQ remains separate from the executable recommendation. `planFor` projects current unexpired, received lots and confirmed pending receipts using FEFO and a constant daily forecast `d`. It finds the first start-of-day stock level at/below ROP (after expiry/receipts), then evaluates the proposed arrival after lead time. The new lot has a full shelf life on receipt and cannot sell on/after its expiry date.

During that new lot's selling window, earlier/equal-expiry existing lots consume forecast demand first. Later-expiry stock does not reduce the new lot's headroom, because FEFO sells the new lot first. `cap = max(0, d × shelf_life − forecast sales allocated to earlier/equal-expiry existing lots)` and `qty = min(round(EOQ), floor(cap))`. Applying the integer cap after rounding prevents 10.61 EOQ / 10.8 cap from becoming an 11-unit recommendation.

The UI and CSV expose projected stock on arrival, existing-lot demand consumption, raw/integer cap, planned arrival, and the decision reason. The worked worksheet includes a daily projection trace. Order actions are available only for a valid, positive, due-today recommendation with no pending order. Future-date quantities must be recalculated when due; they cannot be executed early using today's arrival date. Existing backend purchase-order duplicate protection remains active.

After accumulating fractional FEFO usage, a cap within 1e-9 units of a positive integer is normalized to that integer to remove floating-point cancellation (e.g. 0.9999999999999993 becomes 1). This does not convert ordinary sub-unit headroom or tiny positive demand into a one-unit order or a no-demand state.

Positive demand with a cap below one unit is marked for review, not "no order needed". EOQ rounding below one unit is a separate review state. Neither case is automatically increased to one unit, since that can exceed the waste constraint. Zero demand, old stock covering the window, and pending orders have distinct states. Missing/insufficient forecast errors, invalid costs/rates/lifetimes, and a projection beyond the 3,650-day review horizon block the recommendation and request review.

The low-level `Calc.plan` can also accept aggregate stock without lots. That fallback conservatively assumes residual stock is still usable and sells before the new lot; it is labeled `aggregate` in exports. Production UI and retrospective policy experiments supply lot details. Simulations assume constant `d` over each planning window even for seasonal naïve, stable lead time, and full shelf life on receipt. This remains a planning heuristic, not a production optimizer or a guarantee of no waste/service level.

The dashboard displays each product's own EOQ and selling unit. It does not sum unlike units into a store-wide EOQ. Changing the 7/14/28-day revenue display does not change the 56-day model inputs. Changing forecast settings or planning costs does change the resulting calculations.

Reference: [MIT OpenCourseWare — Inventory](https://live.ocw.mit.edu/courses/2-854-introduction-to-manufacturing-systems-fall-2016/6c8fec8f99bcf7059b73b82e96d43901_MIT2_854F16_Inventory.pdf).

## Worked calculations for presentations

The dashboard's “ดูการแทนค่า EOQ ทีละขั้น” and “ดูการแทนค่า Confidence ทีละขั้น” buttons open one shared worked-calculation view. It follows the selected product, method, confidence level and planning inputs. The view includes input provenance, the daily series, the moving-average sum or every exponential-smoothing update, annual demand, holding cost, the EOQ numerator and radicand, the shelf-life cap, every residual and squared residual, RMSE, interval bounds and the prior-only calculation behind coverage. Displayed working figures use up to six decimal places; calculations retain full precision.

“บันทึกใบคำนวณออฟไลน์” saves a standalone HTML worksheet with the current values. It works without a database connection, includes expandable audit tables and opens all audit tables for browser printing. This is an explicit snapshot export; the production app continues to use its database connection and does not silently substitute CSV or example data.

An historical example for Traditional Baguette is saved at `outputs/presentation/stockwise-worked-baguette.html`. It predates the lot-adjusted cap and is retained as an audit snapshot, not the current recommendation. It uses the supplied CSV's positive-quantity daily aggregates and previously verified database inputs (cost €0.39, order cost €5, shelf life 1 day). Its header states that the friend's database was unavailable when created. Export a fresh worksheet from the current UI for the new cap/projection; the historical file is not evidence of a fresh database query.

## Verification commands

Run `npm test` for numerical examples, shelf-life caps, separate one-sided/two-sided quantiles, chronological coverage without look-ahead, correlated aggregate errors, insufficient-history handling and zero demand. The dashboard also exports a calculation CSV with model settings, dates, input costs, prediction bounds, measured coverage, EOQ, recommended quantities, safety stock and ROP for independent checking.

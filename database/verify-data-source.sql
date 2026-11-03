-- Read-only: open this query against the SAME server configured by the web app.
-- Expected connection for the current bakery dataset: PAPENGIE / StockWise.
USE [StockWise];
GO
SELECT CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')) AS server_name,
       DB_NAME() AS database_name,
       CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) AS machine_name;

SELECT id, sku, name, unit, cost, price, order_cost, lead_time_days, shelf_life_days
FROM dbo.products ORDER BY id;

SELECT COUNT_BIG(*) AS all_transaction_rows, MIN(sold_at) AS first_sale, MAX(sold_at) AS last_sale
FROM dbo.sales_transactions;

DECLARE @planning_date date = '2022-10-01';
DECLARE @history_start date = DATEADD(day, -56, @planning_date);
SELECT @history_start AS history_start, @planning_date AS exclusive_end,
       COUNT_BIG(*) AS analysis_window_rows,
       SUM(CAST(qty AS bigint)) AS quantity,
       SUM(CAST(qty * unit_price AS decimal(20,2))) AS revenue_eur
FROM dbo.sales_transactions WHERE sold_at >= @history_start AND sold_at < @planning_date;

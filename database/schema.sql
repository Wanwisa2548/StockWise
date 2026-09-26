-- StockWise: สคริปต์สร้างฐานข้อมูลสำหรับ SQL Server 2019 (รันใน SSMS)
-- สร้างขึ้นจากโครงสร้างจริงของฐานข้อมูลที่ใช้พัฒนา (สินค้า 10 รายการ, 16 ล็อต)
-- หลังรันสคริปต์นี้ ให้รัน "node seed.js" เพื่อสร้างรายการขายจำลอง 56 วัน
-- สคริปต์ปลอดภัยที่จะรันซ้ำ: สร้างเฉพาะสิ่งที่ยังไม่มี และใส่ข้อมูลตัวอย่างเฉพาะตารางที่ยังว่าง

IF DB_ID('StockWise') IS NULL CREATE DATABASE StockWise;
GO
USE StockWise;
GO

IF OBJECT_ID('products') IS NULL
CREATE TABLE products (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  sku             VARCHAR(20)   NOT NULL UNIQUE,
  name            NVARCHAR(100) NOT NULL,
  unit            NVARCHAR(20)  NOT NULL,
  cost            DECIMAL(10,2) NOT NULL,      -- ราคาทุน
  price           DECIMAL(10,2) NOT NULL,      -- ราคาขาย
  order_cost      DECIMAL(10,2) NOT NULL,      -- ค่าสั่งซื้อต่อครั้ง (S ในสูตร EOQ)
  lead_time_days  INT           NOT NULL,      -- ระยะเวลารอสินค้า (L)
  shelf_life_days INT           NOT NULL       -- อายุสินค้า
);

IF OBJECT_ID('inventory_lots') IS NULL
CREATE TABLE inventory_lots (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  product_id    INT  NOT NULL REFERENCES products(id),
  qty_received  INT  NOT NULL,
  qty_remaining INT  NOT NULL,
  received_date DATE NOT NULL,
  expiry_date   DATE NOT NULL
);

IF OBJECT_ID('sales_transactions') IS NULL
CREATE TABLE sales_transactions (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  receipt_no VARCHAR(20)   NOT NULL,
  sold_at    DATETIME2(0)  NOT NULL,
  product_id INT           NOT NULL REFERENCES products(id),
  lot_id     INT           NULL REFERENCES inventory_lots(id),
  qty        INT           NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_product_date')
  CREATE INDEX idx_product_date ON sales_transactions(product_id, sold_at);

IF OBJECT_ID('purchase_orders') IS NULL
CREATE TABLE purchase_orders (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  product_id    INT         NOT NULL REFERENCES products(id),
  order_date    DATE        NOT NULL,
  qty           INT         NOT NULL,
  expected_date DATE        NOT NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','received','cancelled'))
);

IF OBJECT_ID('promotions') IS NULL
CREATE TABLE promotions (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  lot_id       INT           NOT NULL REFERENCES inventory_lots(id),
  discount_pct INT           NOT NULL,
  promo_price  DECIMAL(10,2) NOT NULL,
  start_at     DATETIME2(0)  NOT NULL,
  end_at       DATETIME2(0)  NOT NULL
);

IF OBJECT_ID('forecasts') IS NULL
CREATE TABLE forecasts (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  product_id     INT           NOT NULL REFERENCES products(id),
  run_date       DATE          NOT NULL,
  method         VARCHAR(10)   NOT NULL,
  param          DECIMAL(5,2)  NOT NULL,
  daily_forecast DECIMAL(10,2) NOT NULL,
  mae            DECIMAL(10,2) NULL,
  mape           DECIMAL(6,2)  NULL,
  rmse           DECIMAL(10,2) NULL
);

IF OBJECT_ID('cluster_results') IS NULL
CREATE TABLE cluster_results (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  run_date      DATE         NOT NULL,
  k             INT          NOT NULL,
  product_id    INT          NOT NULL REFERENCES products(id),
  cluster_label NVARCHAR(50) NOT NULL
);
GO

-- ยอดขายรายวัน = รวมรายการขายรายชิ้นเป็นรายวันต่อสินค้า
IF OBJECT_ID('daily_sales', 'V') IS NULL
EXEC('CREATE VIEW daily_sales AS
SELECT product_id, CAST(sold_at AS DATE) AS sale_date, SUM(qty) AS qty
FROM sales_transactions
GROUP BY product_id, CAST(sold_at AS DATE)');
GO

-- ข้อมูลตัวอย่าง (วันที่จำลองของระบบคือ 2026-09-26)
IF NOT EXISTS (SELECT 1 FROM products)
INSERT INTO products (sku, name, unit, cost, price, order_cost, lead_time_days, shelf_life_days) VALUES
  ('milk', N'นมพาสเจอร์ไรส์ 200 มล.', N'กล่อง', 10, 14, 150, 2, 10),
  ('bread', N'ขนมปังแซนด์วิช', N'ถุง', 28, 39, 120, 1, 5),
  ('yog', N'โยเกิร์ตรสผลไม้', N'ถ้วย', 12, 17, 150, 2, 14),
  ('egg', N'ไข่ไก่ แพ็ค 10 ฟอง', N'แพ็ค', 38, 50, 100, 2, 21),
  ('fruit', N'ผลไม้ตัดแต่ง', N'กล่อง', 22, 35, 80, 1, 3),
  ('bun', N'ซาลาเปาไส้หมู', N'ลูก', 9, 15, 100, 2, 7),
  ('water', N'น้ำดื่ม 600 มล.', N'ขวด', 5, 7, 150, 3, 365),
  ('noodle', N'บะหมี่กึ่งสำเร็จรูป', N'ซอง', 5.5, 7, 120, 5, 180),
  ('coffee', N'กาแฟกระป๋อง', N'กระป๋อง', 13, 17, 150, 4, 270),
  ('rice', N'ข้าวหอมมะลิ 5 กก.', N'ถุง', 180, 215, 200, 5, 365);

IF NOT EXISTS (SELECT 1 FROM inventory_lots)
INSERT INTO inventory_lots (product_id, qty_received, qty_remaining, received_date, expiry_date) VALUES
  ((SELECT id FROM products WHERE sku = 'milk'), 110, 110, '2026-09-18', '2026-09-28'),
  ((SELECT id FROM products WHERE sku = 'milk'), 140, 140, '2026-09-23', '2026-10-03'),
  ((SELECT id FROM products WHERE sku = 'bread'), 14, 14, '2026-09-22', '2026-09-27'),
  ((SELECT id FROM products WHERE sku = 'bread'), 30, 30, '2026-09-25', '2026-09-30'),
  ((SELECT id FROM products WHERE sku = 'yog'), 70, 70, '2026-09-15', '2026-09-29'),
  ((SELECT id FROM products WHERE sku = 'yog'), 90, 90, '2026-09-24', '2026-10-08'),
  ((SELECT id FROM products WHERE sku = 'egg'), 20, 20, '2026-09-14', '2026-10-05'),
  ((SELECT id FROM products WHERE sku = 'egg'), 22, 22, '2026-09-23', '2026-10-14'),
  ((SELECT id FROM products WHERE sku = 'fruit'), 18, 18, '2026-09-24', '2026-09-27'),
  ((SELECT id FROM products WHERE sku = 'fruit'), 25, 25, '2026-09-25', '2026-09-28'),
  ((SELECT id FROM products WHERE sku = 'bun'), 45, 45, '2026-09-21', '2026-09-28'),
  ((SELECT id FROM products WHERE sku = 'bun'), 60, 60, '2026-09-25', '2026-10-02'),
  ((SELECT id FROM products WHERE sku = 'water'), 180, 180, '2026-07-23', '2027-07-23'),
  ((SELECT id FROM products WHERE sku = 'noodle'), 520, 520, '2026-08-27', '2027-02-23'),
  ((SELECT id FROM products WHERE sku = 'coffee'), 150, 150, '2026-07-18', '2027-04-14'),
  ((SELECT id FROM products WHERE sku = 'rice'), 35, 35, '2026-05-24', '2027-05-24');
GO

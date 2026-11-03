-- StockWise: สคริปต์สร้างฐานข้อมูลสำหรับ SQL Server 2019 (รันใน SSMS)
-- โครงสร้างสำหรับข้อมูลเบเกอรี่ หน่วยเงิน EUR; ไม่ใส่ข้อมูลตัวอย่างลงฐานจริง
-- นำเข้ายอดขาย/สินค้า/ล็อตของผู้ใช้แยกต่างหาก; ใช้ npm run demo เพื่อดูข้อมูลจำลองโดยไม่เขียน SQL
-- รันซ้ำได้: สร้างเฉพาะตาราง/view ที่ยังไม่มี ไม่เปลี่ยนข้อมูลเดิม

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

-- ไม่มีการ seed ข้อมูล ใช้ชุดเบเกอรี่ของผู้ใช้ หรือ npm run demo แบบ read-only

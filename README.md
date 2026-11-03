# StockWise · French Bakery DSS

ระบบสนับสนุนการตัดสินใจสำหรับผู้ดูแลสต็อกร้านเบเกอรี่: พยากรณ์ยอดขาย เปรียบเทียบโมเดล แนะนำจำนวน/วันสั่งซื้อ ตรวจล็อตด้วย FEFO และประเมินนโยบายสต็อก เชื่อม SDG 12 เรื่องทรัพยากรและของเสีย โดยผู้ใช้เลือกดำเนินการเอง

Stack: Node.js + Express + SQL Server · HTML/CSS/JavaScript · หน่วยเงิน EUR (€)

## เริ่มใช้งาน

ติดตั้ง Node.js 22+ แล้วรัน `npm install`

**ฐานข้อมูลจริง:** คัดลอก `.env.example` เป็น `.env` กรอกการเชื่อมต่อ SQL Server รัน `npm start` แล้วเปิด http://localhost:3000 ต้องเชื่อมเครือข่าย/VPN ของฐานข้อมูลก่อน

ชุด Bakery ที่ตรวจไว้ใช้ `SIM_TODAY=2022-10-01` วิเคราะห์ย้อนหลัง 56 วันสิ้นสุด 2022-09-30 ตั้งวันให้ตรงกับยอดขาย/ล็อต การเปลี่ยน `.env` ต้องเริ่มเซิร์ฟเวอร์ใหม่ ไม่มีการเปลี่ยน `.env` ของผู้ใช้อัตโนมัติ

**Demo ไม่ต้องมีฐานข้อมูล:** รัน `npm run demo` เปิด URL เดียวกัน ใช้ข้อมูลเบเกอรี่จำลองที่สร้างซ้ำได้ มีป้าย DEMO และปฏิเสธการบันทึก API ทุกชนิด ไม่อ่านหรือเปลี่ยน SQL Server และไม่ใช่ fallback เมื่อฐานข้อมูลจริงขัดข้อง หยุดเซิร์ฟเวอร์ที่ใช้พอร์ตเดียวกันก่อนเปิดอีกโหมด

สาธิตสั่งซื้อ/รับของ/ตั้งโปรจริงให้ใช้ `npm start` กับฐาน Demo ที่แยกไว้ ส่วนโหมดจำลองใช้แสดงการวิเคราะห์และส่งออกได้

## 9 หน้าของระบบ

| หน้า | สิ่งที่ทำ |
|---|---|
| ภาพรวมร้าน | KPI, คำแนะนำ, ช่วงคาดการณ์, EOQ, ใบคำนวณแทนค่าและ CSV |
| วิเคราะห์ยอดขาย | ยอดรายวัน/รายชั่วโมง และ heatmap |
| พยากรณ์ยอดขาย | MA/ES ปรับเอง, เปรียบเทียบ 9 วิธี/พารามิเตอร์, เลือกโมเดลรายสินค้า, MAE/RMSE/MAPE |
| วางแผนจัดซื้อ | EOQ, Safety Stock, ROP, เหตุผลรายสินค้า, ใบสั่งซื้อ/รับของ |
| จัดการของใกล้หมดอายุ | FEFO, จำนวนเสี่ยง, กฎส่วนลด, เวลาเริ่มโปร |
| จัดกลุ่มสินค้า | K-means++, SSE/Elbow, Silhouette และนโยบายที่เป็นกฎแนะนำ |
| สินค้าและสต็อก | แก้ข้อมูลประกอบและล็อตในฐานข้อมูล |
| ประเมินผล DSS | แผนสั่งคงที่เทียบ DSS บน holdout เดียวกัน คิดหมดอายุ/Lead Time ปรับสมมติฐานและส่งออก |
| สไลด์และ Demo | สไลด์ไทย 9 หน้าจากข้อมูลที่โหลด พิมพ์/บันทึก PDF ผ่านเบราว์เซอร์ ส่งออก HTML ออฟไลน์ |

## โมเดลและการประเมิน

- MA(7/14/28), ES(α=.15/.30/.50/.80), Naïve และ Seasonal naïve รอบ 7 วัน
- 56 วัน: ฝึกเริ่ม 28 → validation 14 เพื่อเลือก RMSE ต่ำสุด → Test 14 วันสุดท้าย ทุกวิธีใช้วันประเมินเดียวกัน ใช้อดีตทีละวัน ไม่ใช้ Test เลือกผู้ชนะ
- ต้องมี ≥42 วันจึงเปรียบเทียบได้; ช่วง 42–55 วันแบ่ง validation/test เท่า ๆ กัน อย่างน้อยช่วงละ 7 วัน และฝึกเริ่มอย่างน้อย 28 วัน
- กด “ใช้โมเดลที่แนะนำกับสินค้านี้” เพื่อส่งผลไปทุกหน้า การเลือกอยู่ในหน่วยความจำ ไม่คงอยู่หลังโหลดเว็บใหม่ forecasts ที่บันทึกเป็นหลักฐานผล ไม่ใช่การตั้งค่าโมเดลถาวร
- MAE/RMSE ยิ่งต่ำยิ่งดี; MAPE ข้ามยอดจริง 0 แสดงจำนวนวันที่ใช้ ถ้าคำนวณไม่ได้แสดง —
- ตารางเปรียบเทียบเป็น Test ที่แยกไว้ ส่วน KPI/forecasts เป็น rolling backtest ทั้งช่วง จึงอาจต่างกัน
- Confidence เป็นระดับเป้าหมายช่วงประมาณ ไม่ใช่ accuracy; Coverage คือผลครอบคลุมที่วัดย้อนหลัง

[วิธีวิจัยและข้อจำกัด](docs/dss-methodology.md) · [ใบคำนวณ](docs/calculations.md) · [ตรวจข้อมูล CSV](docs/csv-audit.md) · [เตรียมนำเสนอ/Demo](docs/demo-guide.md)

## ข้อมูลและฐานข้อมูล

API อ่าน SQL Server ที่กำหนด ไม่อ่าน CSV ใน Downloads โดยตรง ดูขอบเขตการตรวจ 10 สินค้า/Quantity > 0 ใน `docs/csv-audit.md` ต้นทุน ค่าสั่งซื้อ อายุสินค้า Lead Time และล็อตต้องกำหนด/ตรวจสอบแยกจาก CSV ขาย

`database/schema.sql` สร้างฐาน/ตารางและ view เปล่าสำหรับฐานใหม่ ต้องนำเข้าข้อมูลเบเกอรี่เอง ไม่มีการรัน schema หรือนำเข้าอัตโนมัติ

`seed.js` และ `npm run seed` เป็นเครื่องมือมินิมาร์ทจำลองปี 2026 เดิม ซึ่ง **ลบรายการขายเดิม** ไม่ใช่ชุดเบเกอรี่ ห้ามใช้กับฐานที่นำเข้าข้อมูลแล้ว ใช้ `npm run demo` เพื่อสาธิตโดยไม่เปลี่ยนฐาน

## โครงสร้าง

```text
server.js / db.js / config.js    HTTP server, SQL connection, planning date
demo-data.js                    explicit read-only synthetic demo
routes/                         APIs and recorded decisions
database/schema.sql             empty schema
public/js/calc.js               models, evaluation, policies, EOQ/ROP, FEFO, K-means
public/js/pages/                9 pages including evaluation and printable slides
public/js/calculation-details.js worked calculations and offline export
docs/                           methodology, provenance, demo script
tests/                          numerical and leakage checks
scripts/ui-smoke.cjs            browser checks on explicit synthetic demo
```

## ตรวจสอบ

```bash
npm test
npm run test:ui
```

`npm test` ไม่เชื่อมฐานข้อมูล ครอบคลุมสูตร วันทดสอบตรงกัน การไม่มองอนาคต โมเดลรายสินค้า สมดุลสินค้า/ต้นทุน simulation หมดอายุ และ Silhouette

`test:ui` ใช้ Playwright ใน devDependencies ต้องติดตั้ง Chromium ด้วย `npx playwright install chromium` หากยังไม่มี หรือใช้ Chrome ที่ติดตั้งแล้วด้วย `$env:PLAYWRIGHT_CHANNEL='chrome'` ใน PowerShell ก่อนรัน เปิด Demo บนพอร์ตว่างของตัวเอง ทดสอบ UI/export โดยไม่เขียน SQL Server ผลทดสอบสูตร/หน้าจอไม่ใช่หลักฐานความแม่นยำทางธุรกิจ

## API

อ่าน `/api/data`, `/api/products`, `/api/lots`, `/api/daily-sales/:productId` · แก้สินค้า/ล็อต `/api/products/:id`, `/api/lots/:id` · ใบสั่งซื้อ `/api/purchase-orders` · โปรโมชั่น `/api/promotions` · ผลวิเคราะห์ `/api/forecasts`, `/api/cluster-results`

`POST /api/forecasts`: `method`, `param`, `items[]` และ `models[]` แบบเลือกได้ (`product_id, method, param`) รองรับ ma/es/naive/seasonal ในตารางเดิม ไม่ต้องเพิ่มคอลัมน์ บันทึกซ้ำสินค้า/วัน/โมเดล/พารามิเตอร์เดิมแทนที่ ผลอ่านเป็นรายการบันทึกล่าสุดรายสินค้า MAPE เก็บ NULL เมื่อคำนวณไม่ได้

SQL ใช้ parameterized inputs และตรวจค่าฝั่งเซิร์ฟเวอร์

## Git workflow

`main` = เสถียร · `dev` = รวมงาน · ไม่ push main โดยตรง ให้ merge จาก dev เมื่อพร้อมส่ง

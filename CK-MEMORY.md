# CK-MEMORY — tambon-health-game

**เกม "ตำบลที่เดินอยู่"** · repo **public** `nrok47/tambon-health-game` · เล่นที่ https://nrok47.github.io/tambon-health-game/

## ⚠️ repo นี้เป็น public — ของในที่ทำงานห้ามขึ้น

ตัวเกมคัดมาจาก `CK-OS/docs/digital-twin-hpc10/health-strategy-game/` **เฉพาะไฟล์เกม**
กรองออกก่อนขึ้นทุกครั้ง: ชื่อ repo ส่วนตัว (spirit-parade, po_godot) · ศอ.10 · ตัวเลขงานจริง · path เครื่อง · ชื่อคน

**เอกสารภายในอยู่ฝั่ง CK-OS เท่านั้น** — `README.md` (ประวัติ v0.1→v1.1 + เหตุผลการออกแบบ) · `SUMMARY.md` · `IDEAS-WORKSHOP.md`
repo นี้มีแต่ README สาธารณะที่เขียนใหม่

## วิธีอัปเดต

แก้ที่ `CK-OS/docs/digital-twin-hpc10/health-strategy-game/` (ต้นฉบับ) แล้วรัน
`scratchpad/make_public.py` เพื่อคัด+กรองมาที่นี่ · อย่าแก้ที่นี่ตรง ๆ ไม่งั้นสองฝั่งแยกกัน

## สถานะ v1.1

เล่นได้ครบลูป · สมดุล: อยู่หมู่บ้านเดียว F30 · ขยายไม่ตามต่อ D47 · ขยาย+ตามต่อ C66 · +วิจัย C67
**เกณฑ์รับที่ยังไม่ผ่าน: คน 2 คนที่ไม่ใช่ CK เล่นจบโดยไม่ต้องให้ CK อธิบาย**

แก้สมดุล = `js/config.js` ไฟล์เดียว · เปลี่ยนภาพ = ตาราง `SPRITE` ใน `js/ui.js`

import fs from 'node:fs';
import xlsx from 'xlsx';

const filePath = process.argv[2] || './data/event-table.xlsx';

if (!fs.existsSync(filePath)) {
  console.log(`❌ 找不到文件: ${filePath}`);
  process.exit(1);
}

const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

console.log(`🔍 正在检查 [${sheetName}]，共 ${data.length} 行数据...\n`);

let errors = 0;
const requiredFields = ['事件编号', '年份', '标题', '类别', '出处编号', '能否公开'];

data.forEach((row, index) => {
  const rowNum = index + 2; // Excel 实际行号
  let rowErrors = [];

  for (const field of requiredFields) {
    if (!row[field] || String(row[field]).trim() === '') {
      rowErrors.push(`[${field}] 为空`);
    }
  }

  if (row['年份'] && isNaN(Number(row['年份']))) {
    rowErrors.push(`[年份] 不是纯数字 (当前是: ${row['年份']})`);
  }

  const validCategories = ['学校沿革', '学术教育', '校园生活'];
  if (row['类别'] && !validCategories.includes(row['类别'])) {
    rowErrors.push(`[类别] 不在允许范围内 (当前是: ${row['类别']})`);
  }

  if (row['能否公开'] && !['是', '否'].includes(row['能否公开'])) {
    rowErrors.push(`[能否公开] 只能填"是"或"否" (当前是: ${row['能否公开']})`);
  }

  if (rowErrors.length > 0) {
    console.log(`❌ 第 ${rowNum} 行出错:`);
    rowErrors.forEach(err => console.log(`   - ${err}`));
    errors++;
  }
});

if (errors > 0) {
  console.log(`\n⚠️ 检查完毕：共发现 ${errors} 行存在错误，请修改后再发给 C 组。`);
} else {
  console.log(`\n✅ 完美！${data.length} 行数据全部符合规范，可以直接导入数据库！`);
}

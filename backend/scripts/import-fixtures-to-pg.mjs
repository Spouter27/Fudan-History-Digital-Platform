import fs from 'node:fs';
import pg from 'pg';

const pool = new pg.Pool({
  database: 'fudan_history',
  user: 'postgres',
  password: process.env.PGPASSWORD,
  host: '127.0.0.1',
  port: 5432,
});

const data = JSON.parse(fs.readFileSync('./fixtures/catalog.json', 'utf8'));

for (const [kind, items] of Object.entries(data)) {
  for (const item of items) {
    await pool.query(
      'INSERT INTO catalog_items (kind, id, payload, published) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [kind, item.id, JSON.stringify(item), 1]
    );
  }
}

await pool.end();
console.log('导入完成');

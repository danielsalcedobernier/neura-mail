import { Pool } from 'pg';

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  if (!pool) {
    console.warn('[db] DATABASE_URL not set — returning empty result');
    return [];
  }
  const query = strings.reduce(
    (acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''),
    ''
  );
  const result = await pool.query(query, values);
  return result.rows;
};

export default sql;

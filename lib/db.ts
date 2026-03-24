import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Este pequeño "truco" permite que sigas usando la sintaxis sql`QUERY` 
// que v0 generó, pero usando tu nuevo Postgres de Contabo.
export const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ""), "");
  const result = await pool.query(query, values);
  return result.rows;
};

export default sql;

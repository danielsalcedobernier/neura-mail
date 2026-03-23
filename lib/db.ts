import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Configuramos el pool de conexiones para tu VPS de Contabo
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Al estar en el mismo VPS, no necesitas configuraciones complejas de SSL
});

// Mantenemos el nombre 'sql' para no romper el resto de tu app
export const sql = pool;

export default pool;

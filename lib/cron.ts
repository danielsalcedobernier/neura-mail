import sql from './db'

export async function acquireCronLock(jobName: string): Promise<boolean> {
  // Atomic lock: only proceed if not already running and lock is not stale (>10min)
  const result = await sql`
    UPDATE cron_jobs SET
      is_running = true,
      locked_at = NOW()
    WHERE name = ${jobName}
      AND (is_running = false OR locked_at < NOW() - INTERVAL '2 minutes')
    RETURNING id
  `
  return result.length > 0
}

export async function releaseCronLock(jobName: string, status: 'success' | 'error', error?: string) {
  await sql`
    UPDATE cron_jobs SET
      is_running = false,
      locked_at = NULL,
      last_run_at = NOW(),
      last_run_status = ${status},
      last_error = ${error || null},
      run_count = run_count + 1
    WHERE name = ${jobName}
  `
}

export async function withCronLock<T>(
  jobName: string,
  fn: () => Promise<T>
): Promise<{ ran: boolean; result?: T; error?: string }> {
  const acquired = await acquireCronLock(jobName)
  if (!acquired) return { ran: false }

  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    await sql`
      UPDATE cron_jobs SET
        is_running = false, locked_at = NULL, last_run_at = NOW(),
        last_run_status = 'success', last_error = NULL,
        last_run_duration_ms = ${duration}, run_count = run_count + 1
      WHERE name = ${jobName}
    `
    return { ran: true, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await releaseCronLock(jobName, 'error', message)
    return { ran: true, error: message }
  }
}

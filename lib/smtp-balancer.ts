import sql from '@/lib/db'

export interface SmtpAllocation {
  smtp_server_id: string
  count: number        // how many emails this server should send
}

export interface ActiveSmtp {
  id: string
  name: string
  host: string
  port: number
  username: string
  password_encrypted: string
  encryption: string
  from_email: string
  from_name: string | null
  max_per_minute: number
  max_per_hour: number | null
  max_per_day: number | null
  sent_this_hour: number
  sent_today: number
  hour_reset_at: string | null
  day_reset_at: string | null
  // warmup fields
  warmup_enabled: boolean
  warmup_start_date: string | null
  warmup_initial_per_minute: number | null
  warmup_increment_per_minute: number | null
  warmup_days_per_step: number | null
  warmup_max_per_minute: number | null
  capacity: number     // final computed capacity for this tick
  warmup_current_limit: number | null  // current warmup rpm, null if not in warmup
}

/**
 * Compute the current warmup limit (emails/minute) for a server.
 * Returns null if warmup is disabled or warmup has completed (exceeded warmup_max).
 *
 * Formula:
 *   days_elapsed = floor((now - warmup_start_date) / days_per_step)
 *   current_limit = initial + (days_elapsed * increment)
 *   capped at warmup_max_per_minute
 */
export function computeWarmupLimit(server: {
  warmup_enabled: boolean
  warmup_start_date: string | null
  warmup_initial_per_minute: number | null
  warmup_increment_per_minute: number | null
  warmup_days_per_step: number | null
  warmup_max_per_minute: number | null
  max_per_minute: number
}): number | null {
  if (!server.warmup_enabled || !server.warmup_start_date) return null

  const startDate = new Date(server.warmup_start_date)
  const now = new Date()
  const msPerDay = 1000 * 60 * 60 * 24
  const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / msPerDay)

  if (daysElapsed < 0) return null  // warmup hasn't started yet

  const initial   = Number(server.warmup_initial_per_minute   ?? 10)
  const increment = Number(server.warmup_increment_per_minute ?? 10)
  const daysStep  = Math.max(1, Number(server.warmup_days_per_step ?? 1))
  const maxLimit  = Number(server.warmup_max_per_minute ?? server.max_per_minute)

  const steps = Math.floor(daysElapsed / daysStep)
  const current = Math.min(initial + steps * increment, maxLimit)

  // If warmup limit has reached or exceeded max_per_minute, warmup is complete
  if (current >= server.max_per_minute) return null

  return current
}

/**
 * Reset counters that have expired and return fresh capacity for each active SMTP server.
 * Capacity = min(effective_per_minute, remaining_hour, remaining_day)
 * where effective_per_minute = warmup_current_limit ?? max_per_minute
 */
export async function getActiveSmtpServers(userId: string): Promise<ActiveSmtp[]> {
  const servers = await sql`
    SELECT id, name, host, port, username, password_encrypted, encryption,
           from_email, from_name, max_per_minute, max_per_hour, max_per_day,
           sent_this_hour, sent_today, hour_reset_at, day_reset_at,
           warmup_enabled, warmup_start_date, warmup_initial_per_minute,
           warmup_increment_per_minute, warmup_days_per_step, warmup_max_per_minute
    FROM smtp_servers
    WHERE user_id = ${userId} AND is_active = true
    ORDER BY created_at ASC
  `

  const now = new Date()
  const result: ActiveSmtp[] = []

  for (const s of servers) {
    let sentHour = Number(s.sent_this_hour)
    let sentDay  = Number(s.sent_today)

    // Reset hourly counter if expired
    if (s.hour_reset_at && new Date(s.hour_reset_at) < now) {
      await sql`UPDATE smtp_servers SET sent_this_hour = 0, hour_reset_at = NOW() + INTERVAL '1 hour' WHERE id = ${s.id}`
      sentHour = 0
    }
    // Reset daily counter if expired
    if (s.day_reset_at && new Date(s.day_reset_at) < now) {
      await sql`UPDATE smtp_servers SET sent_today = 0, day_reset_at = NOW() + INTERVAL '1 day' WHERE id = ${s.id}`
      sentDay = 0
    }

    // Compute warmup limit — overrides max_per_minute when active
    const warmupLimit = computeWarmupLimit({
      warmup_enabled:            Boolean(s.warmup_enabled),
      warmup_start_date:         s.warmup_start_date,
      warmup_initial_per_minute: s.warmup_initial_per_minute,
      warmup_increment_per_minute: s.warmup_increment_per_minute,
      warmup_days_per_step:      s.warmup_days_per_step,
      warmup_max_per_minute:     s.warmup_max_per_minute,
      max_per_minute:            Number(s.max_per_minute),
    })

    const effectivePerMin = warmupLimit !== null ? warmupLimit : Number(s.max_per_minute)
    const maxPerHour = s.max_per_hour ? Number(s.max_per_hour) : Infinity
    const maxPerDay  = s.max_per_day  ? Number(s.max_per_day)  : Infinity

    const remaining_hour = Math.max(0, maxPerHour - sentHour)
    const remaining_day  = Math.max(0, maxPerDay  - sentDay)
    const capacity = Math.min(effectivePerMin, remaining_hour, remaining_day)

    if (capacity > 0) {
      result.push({
        ...s,
        warmup_enabled: Boolean(s.warmup_enabled),
        sent_this_hour: sentHour,
        sent_today: sentDay,
        capacity,
        warmup_current_limit: warmupLimit,
      })
    }
  }

  return result
}

/**
 * Weighted round-robin allocation.
 * Distributes `total` recipients across servers proportional to their capacity.
 * Returns only servers that receive at least 1 recipient.
 */
export function allocate(servers: ActiveSmtp[], total: number): SmtpAllocation[] {
  if (servers.length === 0 || total === 0) return []

  const totalCapacity = servers.reduce((sum, s) => sum + s.capacity, 0)
  const capped = Math.min(total, totalCapacity)

  const allocations: SmtpAllocation[] = []
  let assigned = 0

  for (let i = 0; i < servers.length; i++) {
    const s = servers[i]
    const isLast = i === servers.length - 1
    const count = isLast
      ? capped - assigned
      : Math.floor((s.capacity / totalCapacity) * capped)
    if (count > 0) {
      allocations.push({ smtp_server_id: s.id, count })
      assigned += count
    }
  }

  return allocations
}

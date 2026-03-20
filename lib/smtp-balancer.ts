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
  capacity: number     // computed available capacity for this tick
}

/**
 * Reset counters that have expired and return fresh capacity for each active SMTP server.
 * Capacity = min(max_per_minute, remaining_hour, remaining_day)
 */
export async function getActiveSmtpServers(userId: string): Promise<ActiveSmtp[]> {
  const servers = await sql`
    SELECT id, name, host, port, username, password_encrypted, encryption,
           from_email, from_name, max_per_minute, max_per_hour, max_per_day,
           sent_this_hour, sent_today, hour_reset_at, day_reset_at
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

    const maxPerMin  = Number(s.max_per_minute)
    const maxPerHour = s.max_per_hour ? Number(s.max_per_hour) : Infinity
    const maxPerDay  = s.max_per_day  ? Number(s.max_per_day)  : Infinity

    const remaining_hour = Math.max(0, maxPerHour - sentHour)
    const remaining_day  = Math.max(0, maxPerDay  - sentDay)
    const capacity = Math.min(maxPerMin, remaining_hour, remaining_day)

    if (capacity > 0) {
      result.push({ ...s, sent_this_hour: sentHour, sent_today: sentDay, capacity })
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
      ? capped - assigned  // give the remainder to the last server
      : Math.floor((s.capacity / totalCapacity) * capped)
    if (count > 0) {
      allocations.push({ smtp_server_id: s.id, count })
      assigned += count
    }
  }

  return allocations
}

import { prisma } from '../db/client.js'

const GUEST_MAX_AGE_HOURS = 72
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // every hour

export function startCleanup() {
  const runCleanup = async () => {
    try {
      const cutoff = new Date(Date.now() - GUEST_MAX_AGE_HOURS * 60 * 60 * 1000)

      const staleGuests = await prisma.studyUser.findMany({
        where: {
          isGuest: true,
          lastActiveAt: { lt: cutoff },
        },
        select: { id: true },
      })

      if (staleGuests.length === 0) return

      const ids = staleGuests.map((g) => g.id)

      // Delete in order: child records first
      await prisma.todoItem.deleteMany({ where: { userId: { in: ids } } })
      await prisma.studySession.deleteMany({ where: { userId: { in: ids } } })
      await prisma.session.deleteMany({ where: { userId: { in: ids } } })
      await prisma.studyUser.deleteMany({ where: { id: { in: ids } } })

      console.log(`[cleanup] removed ${ids.length} stale guest(s)`)
    } catch (err) {
      console.error('[cleanup] error:', err)
    }
  }

  // Run once on startup, then on interval
  runCleanup()
  setInterval(runCleanup, CLEANUP_INTERVAL_MS)
}

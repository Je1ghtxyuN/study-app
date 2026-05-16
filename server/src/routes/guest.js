import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'
import { SESSION_DURATION_MS } from '../middleware/auth.js'

const guest = new Hono()

guest.post('/', async (c) => {
  // If the caller already has a valid non-guest session, don't overwrite it
  const currentUser = c.get('user')
  if (currentUser && !currentUser.isGuest) {
    return c.json({
      user: { id: currentUser.id, nickname: currentUser.nickname, isGuest: false },
    })
  }

  const id = crypto.randomUUID()
  const suffix = id.slice(0, 8)

  const user = await prisma.studyUser.create({
    data: {
      email: `guest-${id}@temp.local`,
      nickname: `Guest-${suffix}`,
      isGuest: true,
    },
  })

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt },
  })

  setCookie(c, 'study_session', session.id, {
    httpOnly: true,
    secure: env.COOKIE_DOMAIN !== 'localhost',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
    domain: env.COOKIE_DOMAIN,
  })

  return c.json({
    user: { id: user.id, nickname: user.nickname, isGuest: true },
  }, 201)
})

export { guest }

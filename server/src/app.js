import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { errorHandler } from './middleware/errorHandler.js'
import { authMiddleware } from './middleware/auth.js'
import { health } from './routes/health.js'
import { music } from './routes/music.js'
import { userAuth } from './routes/user-auth.js'
import { studySessions } from './routes/study-sessions.js'
import { todos } from './routes/todos.js'
import { backgrounds } from './routes/backgrounds.js'
import { guest } from './routes/guest.js'

export function createApp() {
  const app = new Hono()

  app.use('*', logger())
  app.use('*', cors({
    origin: ['http://localhost:5173', 'https://study.je1ght.top'],
    credentials: true,
  }))
  app.use('*', errorHandler())
  app.use('*', authMiddleware())

  app.route('/', health)
  app.route('/guest', guest)
  app.route('/music', music)
  app.route('/user', userAuth)
  app.route('/study-sessions', studySessions)
  app.route('/todos', todos)
  app.route('/backgrounds', backgrounds)

  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  return app
}

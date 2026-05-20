import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { writeFile, mkdir, unlink, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'

const backgrounds = new Hono()

backgrounds.use('*', requireAuth())

backgrounds.get('/', async (c) => {
  const user = c.get('user')
  const items = await prisma.userBackground.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, fileType: true, mimeType: true, fileSize: true, createdAt: true },
  })
  return c.json({ backgrounds: items })
})

backgrounds.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.parseBody({ all: true })
  const file = body['file']
  if (!file || typeof file === 'string') {
    return c.json({ error: 'File is required (field name: file)' }, 400)
  }

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) return c.json({ error: 'Only image/video files allowed' }, 400)

  const validators = {
    image: { types: ['image/jpeg', 'image/png', 'image/webp'], maxSize: 5 * 1024 * 1024 },
    video: { types: ['video/mp4', 'video/webm'], maxSize: 50 * 1024 * 1024 },
  }
  const category = isImage ? 'image' : 'video'
  const { types, maxSize } = validators[category]
  if (!types.includes(file.type)) return c.json({ error: `Unsupported format: ${file.type}` }, 400)
  if (file.size > maxSize) return c.json({ error: `File too large. Max: ${maxSize / 1024 / 1024}MB` }, 400)

  const id = crypto.randomUUID()
  const ext = extname(file.name) || (file.type === 'image/jpeg' ? '.jpg' : `.${file.type.split('/')[1]}`)
  const userDir = join(UPLOADS_DIR, user.id)
  await mkdir(userDir, { recursive: true })
  const filePath = join(userDir, `${id}${ext}`)
  const arrayBuffer = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(arrayBuffer))

  const record = await prisma.userBackground.create({
    data: {
      id,
      userId: user.id,
      fileName: file.name,
      fileType: category,
      mimeType: file.type,
      fileSize: file.size,
      filePath: `${user.id}/${id}${ext}`,
    },
  })

  return c.json({ background: { id: record.id, fileName: record.fileName, fileType: record.fileType, mimeType: record.mimeType, fileSize: record.fileSize, createdAt: record.createdAt } }, 201)
})

backgrounds.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const record = await prisma.userBackground.findFirst({ where: { id, userId: user.id } })
  if (!record) return c.json({ error: 'Not found' }, 404)

  const fullPath = join(UPLOADS_DIR, record.filePath)
  await unlink(fullPath).catch(() => {})
  if (record.thumbnailPath) {
    await unlink(join(UPLOADS_DIR, record.thumbnailPath)).catch(() => {})
  }

  await prisma.userBackground.delete({ where: { id } })
  return c.json({ ok: true })
})

backgrounds.get('/:id/file', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const record = await prisma.userBackground.findFirst({ where: { id, userId: user.id } })
  if (!record) return c.json({ error: 'Not found' }, 404)

  const fullPath = join(UPLOADS_DIR, record.filePath)
  const data = await readFile(fullPath)
  return new Response(data, {
    headers: {
      'Content-Type': record.mimeType,
      'Cache-Control': 'private, max-age=86400',
    },
  })
})

export { backgrounds }

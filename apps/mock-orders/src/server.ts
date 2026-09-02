import express from 'express'

const app = express()
const PORT = process.env.PORT || 5001

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.get(['/orders/slow', '/slow'], async (_req, res) => {
  await new Promise((r) => setTimeout(r, 5000))
  res.json({ slow: true })
})

app.get(['/orders/error', '/error'], (_req, _res) => {
  _res.status(500).json({ error: 'upstream internal error' })
})

app.get('/orders', (_req, res) => {
  res.json([{ id: 1, item: 'golf ball' }, { id: 2, item: 'tee' }])
})

app.get('/orders/:id', (req, res) => {
  res.json({ id: req.params.id, item: 'golf ball' })
})

app.listen(PORT, () => {
  console.log(`mock-orders listening on ${PORT}`)
})

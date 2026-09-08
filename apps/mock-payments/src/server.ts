import express from 'express'

const app = express()
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})
app.use(express.json())
const PORT = process.env.PORT || 5002

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/payments/:id', (req, res) => {
  res.json({ id: req.params.id, status: 'paid' })
})

app.post('/payments', (req, res) => {
  const id = Math.floor(Math.random() * 10000)
  res.status(201).json({ id, ...req.body })
})

app.listen(PORT, () => {
  console.log(`mock-payments listening on ${PORT}`)
})

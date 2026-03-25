const express = require('express')
const app = express()

// 解决 Vercel 跨域
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  next()
})

const registerRouter = require('../router')
registerRouter(app)

module.exports = app

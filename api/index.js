const express = require('express')
const app = express()

// ******** 解决跨域（必须加！Vercel 强制要求） ********
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  next()
})

// ******** 注册你的代理路由（不变） ********
const registerRouter = require('../router')
registerRouter(app)

module.exports = app

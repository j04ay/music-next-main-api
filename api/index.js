const express = require('express');
const app = express();

// ======================================
// 跨域
// ======================================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// 路由
const registerRouter = require('../router');
registerRouter(app);

module.exports = app;

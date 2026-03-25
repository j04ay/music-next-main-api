const express = require('express');
const cors = require('cors');
const app = express();

// GitHub Pages 与本地开发：跨域需显式允许 Origin
const allowedOrigins = [
  'https://j04ay.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ******** 这是写的所有路由逻辑 ********
const registerRouter = require('../router');

// ******** 关键：必须先注册路由 ********
registerRouter(app);

// ******** Vercel 导出 ********
module.exports = app;

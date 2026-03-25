const express = require('express');
const app = express();

// 允许所有跨域（必须写在最前面）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 加载路由
const registerRouter = require('../router');
registerRouter(app);

// 必须加这个端口监听！Vercel 有时候需要它！
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('Server running on port ' + port);
});

module.exports = app;

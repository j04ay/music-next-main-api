const express = require('express');
const app = express();

const registerRouter = require('../router');
registerRouter(app);

module.exports = app;

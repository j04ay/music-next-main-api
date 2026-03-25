const express = require('express');
const app = express();

const registerRouter = require('../registerRouter.js');
registerRouter(app);

module.exports = app;
/*
 * Copyright 2017 dialog LLC <info@dlg.im>
 */

require('dotenv').config();

const env = (name, defaultValue) => process.env[name] || defaultValue;
const envInt = (name, defaultValue) => parseInt(env(name, defaultValue), 10);

module.exports = {
  bot: {
    endpoint: env('BOT_ENDPOINT', 'wss://ws1.dlg.im'),
    username: env('BOT_USERNAME', null),
    password: env('BOT_PASSWORD', null),
    adminId: envInt('BOT_ADMIN_ID', 10)
  },
  sentry: {
    dsn: env('SENTRY_DSN', 'https://d374cc3b3a5e4c1789bb30c4acd5beab:70a55cc41b7b4215855718b9f1e6f497@sentry.transmit.im/18')
  }
};

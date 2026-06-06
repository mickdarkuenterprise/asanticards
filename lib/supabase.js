const { createClient } = require('@supabase/supabase-js');
// 1. Load the websocket tool we installed
const ws = require('ws'); 

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // 2. Add this settings block to fix the error
  {
    realtime: {
      WebSocket: ws,
    },
  }
);

module.exports = supabase;


const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  // supabase-js needs a WebSocket implementation for its realtime client on the server
  {
    realtime: {
      WebSocket: ws,
    },
  }
);

module.exports = supabase;


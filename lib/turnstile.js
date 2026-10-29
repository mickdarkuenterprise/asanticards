// Cloudflare Turnstile bot check for checkout.
// Off until TURNSTILE_SECRET_KEY is set — set it only after the website has the matching site key.

function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

async function verifyTurnstile(token, ip) {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || '' }),
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    return json.success === true;
  } catch (err) {
    console.error('[turnstile] Verification request failed:', err.message);
    return false;
  }
}

module.exports = { turnstileEnabled, verifyTurnstile };

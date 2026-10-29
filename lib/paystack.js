// Paystack API calls made with the secret key.
// Transactions are started here, on the server, for the amount the server calculated —
// the website only receives an access code to open the payment popup.

const PAYSTACK_API = 'https://api.paystack.co';

async function initializeTransaction({ email, amountPesewas, orderRef, metadata }) {
  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountPesewas,
      currency: 'GHS',
      metadata: JSON.stringify(metadata),
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.status || !json.data?.access_code) {
    throw new Error(`Paystack initialize failed for ${orderRef}: ${json.message || res.status}`);
  }
  return { accessCode: json.data.access_code, reference: json.data.reference };
}

module.exports = { initializeTransaction };

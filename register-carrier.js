// Run this ONCE after deploying to Vercel to register the carrier service with Shopify.
// Usage:
//   SHOP=london-hampers-xmr9yemb.myshopify.com TOKEN=shpat_xxx CALLBACK_URL=https://your-app.vercel.app/api/rates node register-carrier.js

const SHOP         = process.env.SHOP;
const TOKEN        = process.env.TOKEN;
const CALLBACK_URL = process.env.CALLBACK_URL;

if (!SHOP || !TOKEN || !CALLBACK_URL) {
  console.error('❌ Set SHOP, TOKEN, and CALLBACK_URL environment variables');
  process.exit(1);
}

async function register() {
  const res = await fetch(`https://${SHOP}/admin/api/2024-10/carrier_services.json`, {
    method:  'POST',
    headers: {
      'Content-Type':           'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({
      carrier_service: {
        name:             'London Hampers Shipping',
        callback_url:     CALLBACK_URL,
        service_discovery: true,
        format:           'json',
      },
    }),
  });

  const data = await res.json();
  if (data.carrier_service) {
    console.log('✅ Carrier service registered!');
    console.log('   ID:', data.carrier_service.id);
    console.log('   Name:', data.carrier_service.name);
    console.log('   Callback:', data.carrier_service.callback_url);
  } else {
    console.error('❌ Error:', JSON.stringify(data, null, 2));
  }
}

register().catch(console.error);

// London Hampers — Shopify Carrier Service
// Deployed on Vercel. Shopify calls POST /api/rates at checkout.
// Env vars required: SHOP, TOKEN

const SHOP  = process.env.SHOP;
const TOKEN = process.env.TOKEN;

// ── In-memory cache (survives warm lambda invocations) ──────────────────────
let cachedRates = null;
let cacheTime   = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Fetch all 753 metaobjects from Shopify (paginated) ──────────────────────
async function fetchAllRates() {
  if (cachedRates && Date.now() - cacheTime < CACHE_TTL) {
    return cachedRates;
  }

  const allRates = [];
  let cursor     = null;
  let hasNext    = true;

  while (hasNext) {
    const query = `
      query GetRates($cursor: String) {
        metaobjects(type: "shipping_rate", first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            fields { key value }
          }
        }
      }`;

    const res  = await fetch(`https://${SHOP}/admin/api/2024-10/graphql.json`, {
      method:  'POST',
      headers: {
        'Content-Type':            'application/json',
        'X-Shopify-Access-Token':  TOKEN,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });

    const json = await res.json();
    const mo   = json?.data?.metaobjects;
    if (!mo) break;

    for (const node of mo.nodes) {
      const fields = {};
      for (const f of node.fields) fields[f.key] = f.value;
      allRates.push(fields);
    }

    hasNext = mo.pageInfo.hasNextPage;
    cursor  = mo.pageInfo.endCursor;
  }

  cachedRates = allRates;
  cacheTime   = Date.now();
  return allRates;
}

// ── Postcode range matching ──────────────────────────────────────────────────
// UK outward codes look like: HA5, W10, SW1A, NW2
// zip_from / zip_to stored as e.g. "HA0", "HA9", "W3", "W5"
function parseCode(code) {
  const m = (code || '').trim().toUpperCase().match(/^([A-Z]+)(\d+)/);
  if (!m) return null;
  return { letters: m[1], number: parseInt(m[2], 10) };
}

function outwardCode(postcode) {
  // "SW1A 1AA" → "SW1A"   "HA5 3AB" → "HA5"
  return (postcode || '').trim().toUpperCase().split(/\s+/)[0];
}

function inRange(postcode, zipFrom, zipTo) {
  const pc   = parseCode(outwardCode(postcode));
  const from = parseCode(zipFrom);
  const to   = parseCode(zipTo);
  if (!pc || !from || !to) return false;
  if (pc.letters !== from.letters) return false;
  return pc.number >= from.number && pc.number <= to.number;
}

// ── Build Shopify rate objects for matching entries ──────────────────────────
const DISPLAY_NAMES = {
  'Next Day Delivery':    'Next Working Day UK Delivery',
  'Same Day Delivery':    'Same Day London Delivery',
  'Dated Delivery':       'Dated UK Delivery',
  'Saturday Delivery':    'Saturday UK Delivery',
  'Sunday Delivery':      'Sunday UK Delivery',
};

const SERVICE_CODES = {
  'Next Working Day UK Delivery': 'next_day',
  'Same Day London Delivery':     'same_day_london',
  'Dated UK Delivery':            'dated_delivery',
  'Saturday UK Delivery':         'saturday',
  'Sunday UK Delivery':           'sunday',
};

const DISPLAY_NAMES = {
  'Next Day Delivery':     'Next Day UK Delivery',
  'Same Day Delivery':     'Same Day London Delivery',
  'Dated Delivery':        'Dated UK Delivery',
  'Saturday Delivery':     'Saturday UK Delivery',
  'Sunday Delivery':       'Sunday UK Delivery',
};

function buildRates(allRates, postcode) {
  const results = [];
  for (const r of allRates) {
    if (inRange(postcode, r.zip_from, r.zip_to)) {
      const displayName = DISPLAY_NAMES[r.delivery_type] || r.delivery_type;
      results.push({
        service_name: displayName,
        service_code: SERVICE_CODES[displayName] || 'custom',
        total_price:  String(Math.round(parseFloat(r.rate) * 100)), // pence
        currency:     'GBP',
      });
    }
  }
  return results;
}

// ── Vercel serverless handler ────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const postcode = req.body?.rate?.destination?.postal_code;
    if (!postcode) return res.status(200).json({ rates: [] });

    const allRates = await fetchAllRates();
    const rates    = buildRates(allRates, postcode);

    console.log(`[carrier] postcode=${postcode} → ${rates.length} rates`);
    return res.status(200).json({ rates });
  } catch (err) {
    console.error('[carrier] error:', err);
    return res.status(500).json({ rates: [] });
  }
}

const http = require('node:http');

const PORT = process.env.PORT || 3000;
const SOURCE_URL = process.env.SOURCE_URL || 'https://test.ooobs.ru/api/orders';

/**
 * Normalizes phone numbers to +7XXXXXXXXXX.
 * Returns null if the number cannot be normalized to 11 Russian digits.
 */
function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return null;
  }

  const digits = rawPhone.replace(/\D/g, '');

  if (digits.length === 11) {
    if (digits.startsWith('7') || digits.startsWith('8')) {
      return '+7' + digits.slice(1);
    }
    return null;
  }

  // Handle 10-digit Russian mobile numbers without prefix (e.g. 9005551212)
  if (digits.length === 10 && digits.startsWith('9')) {
    return '+7' + digits;
  }

  return null;
}

/**
 * Fetches, normalizes, and deduplicates orders.
 */
async function getSynchronizedClients() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Upstream API error: ${response.status} ${response.statusText}`);
  }

  const rawOrders = await response.json();
  const received = rawOrders.length;

  let invalid_dropped = 0;
  let duplicates_merged = 0;

  // Key: normalized phone, Value: chosen client record
  const clientsMap = new Map();

  for (const order of rawOrders) {
    const normalizedPhone = normalizePhone(order.phone);

    if (!normalizedPhone) {
      invalid_dropped++;
      continue;
    }

    const currentClient = {
      name: order.name,
      phone: normalizedPhone,
      email: order.email,
      amount: Number(order.amount),
      _createdAt: new Date(order.created_at).getTime(),
    };

    if (!clientsMap.has(normalizedPhone)) {
      clientsMap.set(normalizedPhone, currentClient);
    } else {
      duplicates_merged++;
      const existing = clientsMap.get(normalizedPhone);

      if (currentClient.amount > existing.amount) {
        clientsMap.set(normalizedPhone, currentClient);
      } else if (currentClient.amount === existing.amount) {
        if (currentClient._createdAt > existing._createdAt) {
          clientsMap.set(normalizedPhone, currentClient);
        }
      }
    }
  }

  const clients = Array.from(clientsMap.values()).map(({ _createdAt, ...client }) => client);

  return {
    clients,
    stats: {
      received,
      unique: clients.length,
      duplicates_merged,
      invalid_dropped,
    },
  };
}

const server = http.createServer(async (req, res) => {
  // Common CORS and JSON headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const data = await getSynchronizedClients();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Sync error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = server;

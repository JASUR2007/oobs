const SOURCE_URL = process.env.SOURCE_URL || 'https://test.ooobs.ru/api/orders';

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
  if (digits.length === 10 && digits.startsWith('9')) {
    return '+7' + digits;
  }
  return null;
}

async function syncOrders() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch orders: ${res.statusText}`);
  }
  const orders = await res.json();

  let received = orders.length;
  let invalid_dropped = 0;
  let duplicates_merged = 0;

  // Phone -> best order
  const clientsMap = new Map();

  for (const order of orders) {
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

      const currentAmount = currentClient.amount;
      const existingAmount = existing.amount;

      if (currentAmount > existingAmount) {
        clientsMap.set(normalizedPhone, currentClient);
      } else if (currentAmount === existingAmount) {
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

syncOrders().then((data) => {
  console.log(JSON.stringify(data, null, 2));
}).catch((err) => {
  console.error(err);
});

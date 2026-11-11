// Server-sent events hub: pushes live invoice updates to the dashboard.
export function createHub() {
  const clients = new Set();
  return {
    add(res) { clients.add(res); res.on('close', () => clients.delete(res)); },
    emit(type, data) {
      const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const c of clients) c.write(msg);
    },
    size: () => clients.size
  };
}

import http from 'node:http';

export function createServer({ records, currentActor, partner }) {
  return http.createServer(async (request, response) => {
    try {
      const id = decodeURIComponent(request.url.slice('/records/'.length));
      if (request.method === 'GET') {
        const record = records.get(id);
        response.writeHead(record ? 200 : 404, {
          'content-type': 'application/json',
        });
        response.end(JSON.stringify(record ?? { error: 'not found' }));
        return;
      }
      if (request.method === 'POST') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const record = records.get(id);
        const receipt = await partner.reserve(body.quantity);
        records.set(id, { ...record, quantity: body.quantity, receipt });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(records.get(id)));
        return;
      }
      response.writeHead(405).end();
    } catch {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'internal error' }));
    }
  });
}

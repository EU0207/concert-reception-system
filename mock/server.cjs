// Serve only the three static mock files to devices on the same local network.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.MOCK_PORT || 8765);

http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': file[1],
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
  } else {
    fs.createReadStream(path.join(__dirname, file[0])).pipe(response);
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`UI mock server: http://localhost:${port}`);
  console.log('On a phone, use this PC’s private IPv4 address with the same port. Press Ctrl+C to stop.');
});

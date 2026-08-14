const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

http.createServer((request, response) => {
  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.(\\|\/|$))+/, '');
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(file);
  });
}).listen(port, () => {
  console.log(`Sales Intelligence platform foundation running at http://localhost:${port}`);
});

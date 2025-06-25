const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve the HTML file
  if (req.url === '/' || req.url === '/test') {
    const htmlPath = path.join(__dirname, 'test-standalone.html');
    fs.readFile(htmlPath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(data);
    });
    return;
  }

  // Mock API endpoint for testing
  if (req.url === '/api/transcription' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('📝 Received transcription:', data.transcription);
        console.log('🕐 Timestamp:', new Date(data.timestamp).toISOString());
        
        // Simulate API processing
        setTimeout(() => {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Transcription received successfully',
            id: Date.now().toString()
          }));
        }, 500); // Simulate 500ms processing time
        
      } catch (error) {
        console.error('❌ Error parsing transcription:', error);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 404 for other routes
  res.writeHead(404);
  res.end('Not found');
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Test server running at http://localhost:${PORT}`);
  console.log(`📝 Open http://localhost:${PORT} to test the microphone component`);
  console.log(`🔊 Make sure to allow microphone access when prompted`);
});
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const booksDir = path.join(__dirname, 'public', 'books');
const dbFile = path.join(__dirname, 'books.json');
const quizzesFile = path.join(__dirname, 'quizzes.json');

// Ensure directories and storage files exist
if (!fs.existsSync(booksDir)) fs.mkdirSync(booksDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify([]));
if (!fs.existsSync(quizzesFile)) fs.writeFileSync(quizzesFile, JSON.stringify([]));

let quizResults = [];

function getBooks() {
  try { return JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch (e) { return []; }
}
function saveBooks(books) { fs.writeFileSync(dbFile, JSON.stringify(books, null, 2)); }

function getQuizzes() {
  try { return JSON.parse(fs.readFileSync(quizzesFile, 'utf8')); } catch (e) { return []; }
}
function saveQuizzes(quizzes) { fs.writeFileSync(quizzesFile, JSON.stringify(quizzes, null, 2)); }

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Upload PDF Book API
  if (req.method === 'POST' && req.url === '/api/upload-book') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const cleanFileName = Date.now() + '-' + data.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const base64Data = data.fileData.replace(/^data:application\/pdf;base64,/, '');
        fs.writeFileSync(path.join(booksDir, cleanFileName), Buffer.from(base64Data, 'base64'));

        const books = getBooks();
        books.push({ id: Date.now(), title: data.title, filename: cleanFileName, timestamp: new Date().toLocaleTimeString() });
        saveBooks(books);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. Fetch Books List API
  if (req.method === 'GET' && req.url === '/api/books') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getBooks()));
    return;
  }

  // 3. Delete Book API
  if (req.method === 'DELETE' && req.url.startsWith('/api/delete-book/')) {
    const id = parseInt(req.url.split('/').pop());
    let books = getBooks();
    const bookToDelete = books.find(b => b.id === id);
    if (bookToDelete) {
      const filePath = path.join(booksDir, bookToDelete.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      books = books.filter(b => b.id !== id);
      saveBooks(books);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success' }));
    return;
  }

  // 4. Create Quiz API (Teacher)
  if (req.method === 'POST' && req.url === '/api/create-quiz') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const quizzes = getQuizzes();
        const newQuiz = {
          id: Date.now(),
          question: data.question,
          options: data.options,
          correctIndex: parseInt(data.correctIndex)
        };
        quizzes.push(newQuiz);
        saveQuizzes(quizzes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 5. Fetch Quizzes API (Student & Teacher)
  if (req.method === 'GET' && req.url === '/api/quizzes') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getQuizzes()));
    return;
  }

  // 6. Delete Quiz API (Teacher)
  if (req.method === 'DELETE' && req.url.startsWith('/api/delete-quiz/')) {
    const id = parseInt(req.url.split('/').pop());
    let quizzes = getQuizzes();
    quizzes = quizzes.filter(q => q.id !== id);
    saveQuizzes(quizzes);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success' }));
    return;
  }

  // 7. Submit Quiz Results API (Student)
  if (req.method === 'POST' && req.url === '/api/submit-quiz') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = {
          id: quizResults.length + 1,
          student_name: data.studentName,
          score: data.score,
          timestamp: new Date().toLocaleTimeString()
        };
        quizResults.push(result);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', id: result.id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 8. Get Teacher Gradebook API
  if (req.method === 'GET' && req.url === '/api/gradebook') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(quizResults));
    return;
  }

  // 9. Serve Static Files
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      let contentType = 'text/html';
      if (filePath.endsWith('.pdf')) contentType = 'application/pdf';
      if (filePath.endsWith('.js')) contentType = 'text/javascript';
      if (filePath.endsWith('.css')) contentType = 'text/css';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Offline Server running at http://localhost:${PORT}`);
});
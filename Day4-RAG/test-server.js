import express from 'express';

const app = express();
const port = 3001;

app.get('/', (req, res) => {
  res.send('Hello from the test server!');
});

app.listen(port, () => {
  console.log(`Test server is running on http://localhost:${port}`);
});

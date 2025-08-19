const express = require('express');

const app = express();
const port = 3002;

app.get('/', (req, res) => {
  res.send('Hello from the CommonJS test server!');
});

app.listen(port, () => {
  console.log(`CommonJS test server is running on http://localhost:${port}`);
});

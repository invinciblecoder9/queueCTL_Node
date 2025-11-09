const express = require('express');
const { db } = require('./db');
const app = express();

app.get('/jobs', (req, res) => {
  const jobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100').all();
  res.json(jobs);
});

app.listen(8080, () => console.log('Dashboard at http://localhost:8080/jobs'));

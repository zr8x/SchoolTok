const express = require('express');
const path = require('path');
const socket = require('socket.io');
const app = express();

app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signin.html'));
})

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
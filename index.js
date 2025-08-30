const express = require('express');
const { createServer } = require('node:http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const multer = require('multer');
const { dirname } = require('node:path');

const app = express();
const server = createServer(app);
const io = new Server(server);



app.set('views', path.join(__dirname, 'views'));

const upload = multer({ dest: 'public/videos/' });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('token@emit', (token) => {
        if (authenticateToken(token)) {
            socket.emit('token@auth');
        } else {
            socket.emit('redirect', '/signin');
        }
    });

    socket.on('token@create', (token, email) => {
        const videos = fs.readdirSync(path.join(__dirname, 'public', 'videos'));
        var tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
        const exists = tokens.some(user => user.email === email);
        if (exists) {
            socket.emit('callback', 'Email is already in use, please sign in.');
            return;
        }
        tokens.push({ email, token, videoPool: videos });
        fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens));
        socket.emit('redirect', '/');
    });

    socket.on('video@get', (token) => {
        var tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')))
        const user = tokens.find(user => user.token === token);
        const videos = fs.readdirSync(path.join(__dirname, 'public', 'videos'));
        const pool = user.videoPool;
        const video = pool[Math.floor(Math.random() * pool.length)];

        socket.emit('video@send', video);

        tokens = tokens.map(u => {
            if (u.token === token) {
                let newPool = u.videoPool.filter(v => v !== video);
                if (newPool.length === 0) {
                    newPool = videos;
                }
                return { ...u, videoPool: newPool };
            }
            return u;
        });
        fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens));
    });

    socket.on('video@submit', (title, file) => {
        console.log(file);
    })
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'app.html'));
});

app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signin.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'create.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
    const title = req.body.title || 'untitled';
    const ext = path.extname(req.file.originalname);
    const newPath = path.join(req.file.destination, title + ext);

    fs.rename(req.file.path, newPath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error saving file.');
        }
        console.log(req.file);
        res.send('File uploaded successfully!');
    });
});

// DEV TOOLS

app.get('/dev/clearcookie', (req, res) => {
    res.send('<script>document.cookie = "token=null;path=/"</script>');
})

app.get('/dev/cleartokens', (req, res) => {
    fs.writeFileSync(path.join(__dirname, 'tokens.json'), '[]');
    res.send('Cleared successfully!')
})

// FUNCTIONS

function authenticateToken(token) {
    const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
    const user = tokens.find(user => user.token === token);
    return user !== undefined;
}

server.listen(8000, () => {
    console.log('Server running at http://localhost:8000');
})
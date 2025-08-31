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

let temp_id = 0;

app.set('views', path.join(__dirname, 'views'));

const upload = multer({ dest: 'public/videos/' });

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    socket.on('token@emit', (token) => {
        if (authenticateToken(token)) {
            const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
            const user = users.find(u => u.token === token);
            socket.emit('token@auth', user.username, temp_id);
            temp_id = 0;
        } else {
            socket.emit('redirect', '/signin');
        }
    });

    socket.on('token@create', (token, email, username) => {
        const videos = fs.readdirSync(path.join(__dirname, 'public', 'videos'));
        var tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
        const exists = tokens.some(user => user.email === email);
        if (exists) {
            socket.emit('callback', 'Email is already in use, please sign in.');
            return;
        }
        tokens.push({ username, email, token, videoPool: videos, notifications: [], likes: [] });
        fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(tokens));
        socket.emit('redirect', '/');
    });

    socket.on('video@get', (token) => {
        var tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
        const user = tokens.find(user => user.token === token);
        const videos = fs.readdirSync(path.join(__dirname, 'public', 'videos'));

        // Check for missing user or empty pool
        if (!user || !user.videoPool || user.videoPool.length === 0) {
            socket.emit('video@none');
            return;
        }

        const pool = user.videoPool;
        const video = pool[Math.floor(Math.random() * pool.length)];

        // Check for undefined video
        if (!video) {
            socket.emit('video@none');
            return;
        }

        const infoArr = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        const info = infoArr.find(v => v.title + path.extname(video) === video) || {
            title: 'No Title',
            username: 'Unknown'
        };


        socket.emit('video@send', video, info);

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

    socket.on('video@get_specific', (video_id) => {
        const videos = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        console.log(videos);
        const video = videos.find(v => v.id === Number(video_id));

        console.log(video);

        socket.emit('video@send', video.title, video);
    })

    socket.on('comment@add', (username, video, msg) => {
        const vid_info = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        let new_info = vid_info.map(v => {
            if (v.title === video) {
                let comments = v.comments;
                comments.push({
                    'username': username,
                    'message': msg
                });

                return { ...v, 'comments': comments };
            }
            return v;
        })

        fs.writeFileSync(path.join(__dirname, 'vid_info.json'), JSON.stringify(new_info));

        const words = msg.split(' ');

        for (const word of words) {
            if (word.includes('@')) {
                const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));

                const mapped_users = users.map(u => {
                    if (u.username === word) {
                        const notifications = [...u.notifications, {
                            type: 'mention',
                            user: username,
                            content: msg,
                            unread: true
                        }]
                        return { ...u, notifications: notifications };
                    }
                    return u;
                });

                fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(mapped_users));
            }
        }
    });

    socket.on('comment@update', (vid) => {
        const vid_info = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        const video = vid_info.find(v => v.title === vid);

        function try_emit() {
            try {
                socket.emit('comment@update', video.comments);
            } catch (err) {
                setTimeout( () => {
                    try_emit();
                }, 1000);
            }
        }

        try_emit();
    });

    socket.on('notifications@update', (token) => {
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
        const user = users.find(u => u.token === token);

        socket.emit('notifications@update', user.notifications);
    });

    socket.on('like@add', (token, video_name) => {
        const videos = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        const video = videos.find(v => v.title === video_name);
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));

        const user = users.find(u => u.token === token);

        if (!user.likes.includes(video.id)) {
            const mapped_videos = videos.map(v => {
                if (v.title === video_name) {
                    return { ...v, likes: v.likes + 1 };
                }
                return v
            })

            const mapped_users = users.map(u => {
                if (u === user) {
                    return { ...u, likes: [ ...u.likes, video.id ] };
                }
                return u;
            })

            fs.writeFileSync(path.join(__dirname, 'vid_info.json'), JSON.stringify(mapped_videos));
            fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(mapped_users));
        }
    })

    socket.on('like@update', (video_name) => {
        const videos = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
        const video = videos.find(v => v.title === video_name);

        socket.emit('like@update', video.likes);
        console.log('Updated on backend')
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
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json')));
    const token = req.body.token;
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, 'vid_info.json')));
    const videos = fs.readdirSync(path.join(__dirname, 'public', 'videos'));

    const user = users.find(u => u.token === token);
    const username = user ? user.username : 'Unknown';
    
    let id = Math.floor(Math.random() * 9000000000) + 1000000000;

    while (true) {
        if (!videos.find(v => v.id === id)) {
            break;
        } else {
            id = Math.floor(Math.random() * 9000000000) + 1000000000;
        }
    }
    

    info.push({
        title: title,
        username: username,
        id: id,
        comments: [],
        likes: 0,
        shares: 0
    })

    fs.writeFileSync(path.join(__dirname, 'vid_info.json'), JSON.stringify(info));

    const applied_users = users.map(u => {
        return { ...u, videoPool: videos }
    })

    fs.writeFileSync(path.join(__dirname, 'tokens.json'), JSON.stringify(applied_users));

    fs.rename(req.file.path, newPath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error saving file.');
        }

        res.send('File uploaded successfully!');
    });
});

app.get('/video/:id', (req, res) => {
    temp_id = req.params.id;
    res.redirect('/');
})

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
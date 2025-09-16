require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const User = require('./models/User');
const News = require('./models/News');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || '';
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

app.use(session({
  secret: process.env.SESSION_SECRET || '',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- Middleware for user ---
app.use(async (req, res, next) => {
  if (req.session.userId) {
    req.user = await User.findById(req.session.userId);
    res.locals.user = req.user;
  } else {
    req.user = null;
    res.locals.user = null;
  }
  next();
});

// --- Home page (news + API homePage widgets) ---
app.get('/', async (req, res) => {
  const news = await News.find({}).populate('author', 'username').sort({ date: -1 });

  // Load homePage widgets from all API modules if present
  const apisDir = path.join(__dirname, 'apis');
  const widgets = [];
  fs.readdirSync(apisDir).forEach(f => {
    if (f.endsWith('.js')) {
      const api = require(path.join(apisDir, f));
      if (typeof api.homePage === 'function') {
        try {
          widgets.push(api.homePage(req.user));
        } catch {}
      } else if (typeof api.homePage === 'string') {
        widgets.push(api.homePage);
      }
    }
  });

  res.render('index', { news, widgets });
});

// --- Auth pages ---
app.get('/login', (req, res) => res.render('login', { error: null }));
app.get('/register', (req, res) => res.render('register', { error: null }));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render('login', { error: 'Invalid credentials' });
  }
  req.session.userId = user._id;
  res.redirect('/');
});

app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (await User.findOne({ username })) return res.render('register', { error: 'Username taken' });
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashed, email, role: 'user' });
  await user.save();
  req.session.userId = user._id;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// --- Profile ---
app.get('/profile', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.render('profile', { user: req.user, error: null });
});

app.post('/profile', async (req, res) => {
  if (!req.user) return res.redirect('/login');
  const { name, bio, avatar } = req.body;
  req.user.profile = { name, bio, avatar };
  await req.user.save();
  res.render('profile', { user: req.user, error: 'Profile updated' });
});

// --- Admin panel ---
app.get('/admin', (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).send('Forbidden');
  res.render('admin');
});

// --- News posting (admin only) ---
app.post('/news', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).send('Forbidden');
  const { title, content } = req.body;
  await News.create({ title, content, author: req.user._id });
  res.redirect('/');
});

// --- API Test page ---
app.get('/apitest', (req, res) => {
  if (!req.user) return res.redirect('/login');
  // List API scripts
  const apiFiles = fs.readdirSync(path.join(__dirname, 'apis')).filter(f => f.endsWith('.js'));
  res.render('apitest', { apis: apiFiles.map(f => f.replace('.js', '')) });
});

// --- API dynamic config/info endpoint ---
app.get('/api/config.:apiname', (req, res) => {
  const { apiname } = req.params;
  const file = path.join(__dirname, 'apis', `${apiname}.js`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'API not found' });
  const api = require(file);
  res.json(api.config || {});
});

// --- API dynamic multi-method execution endpoint ---
const supportedMethods = ['get', 'post', 'put', 'patch', 'delete'];

supportedMethods.forEach(method => {
  app[method]('/api/config.:apiname', async (req, res) => {
    const { apiname } = req.params;
    const file = path.join(__dirname, 'apis', `${apiname}.js`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'API not found' });
    const api = require(file);

    // Prefer method-specific handler, fallback to .api, then .execute
    let handler = (typeof api[method] === 'function')
      ? api[method].bind(api)
      : (typeof api.api === 'function')
        ? api.api.bind(api)
        : (typeof api.execute === 'function')
          ? api.execute.bind(api)
          : null;

    // Check config.methods if present
    if (api.config?.methods && !api.config.methods.includes(method)) {
      return res.status(405).json({ error: `Method ${method.toUpperCase()} not allowed for this API.` });
    }

    if (!handler) return res.status(400).json({ error: `No ${method} handler for this API.` });

    // Pick params: query for GET/DELETE, body for others
    const params = (method === 'get' || method === 'delete') ? req.query : req.body;

    try {
      const result = await handler(params, req, res);
      res.json({ result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// --- Static files for css/js/images ---
app.use(express.static(path.join(__dirname, 'public')));

// --- 404 fallback ---
app.use((req, res) => res.status(404).send('Not Found'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('App running on http://localhost:' + PORT));

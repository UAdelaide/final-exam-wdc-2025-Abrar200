const express = require('express');
const path = require('path');
const session = require('express-session'); // Add session support
require('dotenv').config();

const app = express();

// Session configuration - ADD THIS
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here', // Use environment variable in production
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Database test route - ADD THIS TEMPORARILY
router.get('/test-db', async (req, res) => {
  try {
    console.log('Testing database connection...');

    // Test basic connection
    const [result] = await db.query('SELECT 1 as test');
    console.log('Basic query result:', result);

    // Test if Users table exists and show its structure
    const [tables] = await db.query('SHOW TABLES');
    console.log('Available tables:', tables);

    // Show Users table structure
    const [structure] = await db.query('DESCRIBE Users');
    console.log('Users table structure:', structure);

    // Test Users table content
    const [users] = await db.query('SELECT * FROM Users');
    console.log('All users in database:', users);

    // Test the exact query we're using in login
    const [testQuery] = await db.query(`
      SELECT user_id, username, email, role FROM Users
      WHERE username = ? AND password_hash = ?
    `, ['ownerJane', 'hashedpassword123']);
    console.log('Login query test result:', testQuery);

    res.json({
      connection: 'OK',
      tables: tables,
      userTableStructure: structure,
      allUsers: users,
      loginTestQuery: testQuery
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      error: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
  }
});

// GET all users (for admin/testing)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id, username, email, role FROM Users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST a new user (simple signup)
router.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `, [username, email, password, role]);

    res.status(201).json({ message: 'User registered', user_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET current user session info
router.get('/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// POST login with session storage and debugging
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log('Login attempt:', { username, password }); // Debug log

  try {
    // Query user by username and password (simple comparison for now)
    const [rows] = await db.query(`
      SELECT user_id, username, email, role FROM Users
      WHERE username = ? AND password_hash = ?
    `, [username, password]);

    console.log('Database query result:', rows); // Debug log

    if (rows.length === 0) {
      console.log('No matching user found'); // Debug log
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    console.log('User found:', user); // Debug log

    // Store user information in session
    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    console.log('Session stored:', req.session.user); // Debug log

    // Return success with user role for frontend redirection
    res.json({
      message: 'Login successful',
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Add this to routes/userRoutes.js or create a new dogRoutes.js file
router.get('/my-dogs', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.user_id;

    const query = `
      SELECT dog_id, name, size
      FROM Dogs
      WHERE owner_id = ?
      ORDER BY name
    `;

    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json(results);
    });
  } catch (error) {
    console.error('Error fetching dogs:', error);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

module.exports = router;
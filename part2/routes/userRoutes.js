// POST login with session storage - REPLACE existing login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body; // Changed to username instead of email

  try {
    // Query user by username and password (simple comparison for now)
    const [rows] = await db.query(`
      SELECT user_id, username, email, role FROM Users
      WHERE username = ? AND password_hash = ?
    `, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    // Store user information in session
    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role
    };

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

// POST logout - ADD THIS NEW ROUTE
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Middleware to check if user is authenticated - ADD THIS
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// GET current user session info - MODIFY existing /me route
router.get('/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// Export the auth middleware for use in other routes
module.exports = router;
module.exports.requireAuth = requireAuth;
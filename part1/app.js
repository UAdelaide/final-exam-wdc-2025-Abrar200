const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database configuration - connect without database first
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '', // Empty password for development
    multipleStatements: true
};

let db;

// Initialize database connection and setup
async function initializeDatabase() {
    try {
        // Create connection without specifying database first
        db = await mysql.createConnection(dbConfig);
        console.log('Connected to MySQL database');

        // Read the SQL schema file
        const sqlSchema = await fs.readFile(path.join(__dirname, 'dogwalks.sql'), 'utf8');

        // Split the SQL into individual statements and execute them
        const statements = sqlSchema
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            if (statement.trim()) {
                // Use query() for DDL statements instead of execute()
                await db.query(statement);
            }
        }

        console.log('Database schema initialized');

        // Switch to the created database - use query() for USE statement
        await db.query('USE DogWalkService');
        console.log('Switched to DogWalkService database');

        // Insert sample data
        await insertSampleData();
        console.log('Sample data inserted');

    } catch (error) {
        console.error('Database initialization error:', error);
        process.exit(1);
    }
}

// Insert sample data for testing
async function insertSampleData() {
    try {
        // Insert users
        await db.execute(`
      INSERT IGNORE INTO Users (username, email, password_hash, role) VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('davidwalks', 'david@example.com', 'hashed101', 'walker'),
      ('emma_owner', 'emma@example.com', 'hashed202', 'owner')
    `);

        // Insert dogs
        await db.execute(`
      INSERT IGNORE INTO Dogs (owner_id, name, size) VALUES
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
      ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Rocky', 'large'),
      ((SELECT user_id FROM Users WHERE username = 'emma_owner'), 'Luna', 'small'),
      ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Charlie', 'medium')
    `);

        // Insert walk requests
        await db.execute(`
      INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
      ((SELECT dog_id FROM Dogs WHERE name = 'Max' LIMIT 1), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Bella' LIMIT 1), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'completed'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Rocky' LIMIT 1), '2025-06-11 07:00:00', 60, 'Central Park', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Luna' LIMIT 1), '2025-06-11 15:30:00', 20, 'Riverside Trail', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Charlie' LIMIT 1), '2025-06-12 10:00:00', 40, 'Dog Beach', 'completed')
    `);

        // Insert some sample applications and ratings for testing walkers summary
        await db.execute(`
      INSERT IGNORE INTO WalkApplications (request_id, walker_id, status) VALUES
      (2, (SELECT user_id FROM Users WHERE username = 'bobwalker'), 'accepted'),
      (5, (SELECT user_id FROM Users WHERE username = 'davidwalks'), 'accepted')
    `);

        await db.execute(`
      INSERT IGNORE INTO WalkRatings (request_id, walker_id, owner_id, rating, comments) VALUES
      (2, (SELECT user_id FROM Users WHERE username = 'bobwalker'), (SELECT user_id FROM Users WHERE username = 'carol123'), 5, 'Great walker!'),
      (5, (SELECT user_id FROM Users WHERE username = 'davidwalks'), (SELECT user_id FROM Users WHERE username = 'carol123'), 4, 'Good job')
    `);

    } catch (error) {
        console.error('Error inserting sample data:', error);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Route: /api/dogs
app.get('/api/dogs', async (req, res) => {
    try {
        const query = `
      SELECT
        d.name AS dog_name,
        d.size,
        u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
      ORDER BY d.name
    `;

        const [results] = await db.execute(query);
        res.json(results);

    } catch (error) {
        console.error('Error fetching dogs:', error);
        res.status(500).json({
            error: 'Failed to retrieve dogs data',
            message: error.message
        });
    }
});

// Route: /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const query = `
      SELECT
        wr.request_id,
        d.name AS dog_name,
        wr.requested_time,
        wr.duration_minutes,
        wr.location,
        u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
      ORDER BY wr.requested_time
    `;

        const [results] = await db.execute(query);
        res.json(results);

    } catch (error) {
        console.error('Error fetching open walk requests:', error);
        res.status(500).json({
            error: 'Failed to retrieve open walk requests',
            message: error.message
        });
    }
});

// Route: /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const query = `
      SELECT
        u.username AS walker_username,
        COUNT(wr.rating_id) AS total_ratings,
        ROUND(AVG(wr.rating), 1) AS average_rating,
        COUNT(DISTINCT wa.request_id) AS completed_walks
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
      LEFT JOIN WalkRequests wreq ON wa.request_id = wreq.request_id AND wreq.status = 'completed'
      LEFT JOIN WalkRatings wr ON wa.request_id = wr.request_id AND wa.walker_id = wr.walker_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id, u.username
      ORDER BY u.username
    `;

        const [results] = await db.execute(query);

        // Format the results to handle null values properly
        const formattedResults = results.map(row => ({
            walker_username: row.walker_username,
            total_ratings: row.total_ratings,
            average_rating: row.average_rating || null,
            completed_walks: row.completed_walks
        }));

        res.json(formattedResults);

    } catch (error) {
        console.error('Error fetching walker summary:', error);
        res.status(500).json({
            error: 'Failed to retrieve walker summary',
            message: error.message
        });
    }
});

// Start server after database initialization
async function startServer() {
    await initializeDatabase();

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('- GET /api/dogs');
        console.log('- GET /api/walkrequests/open');
        console.log('- GET /api/walkers/summary');
    });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    if (db) {
        await db.end();
    }
    process.exit(0);
});

// Start the application
startServer().catch(console.error);
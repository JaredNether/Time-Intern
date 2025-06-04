const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const pool = require('./db');
const app = express();

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  // Add your project ID
  projectId: process.env.FIREBASE_PROJECT_ID
});

// Configure CORS with specific options
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

app.listen(5000, () => {
  console.log('Server is running on port 5000');
});

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) throw new Error('No token provided');
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ user: user.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Registration endpoint
app.post('/api/register', verifyToken, async (req, res) => {
    try {
        const { firebase_uid, email, full_name } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO users (firebase_uid, email, full_name) VALUES (?, ?, ?)',
            [firebase_uid, email, full_name]
        );
        res.json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Record attendance endpoint
app.post('/api/attendance', verifyToken, async (req, res) => {
    try {
        // Check for existing open attendance
        const [existing] = await pool.execute(
            `SELECT * FROM attendance 
             WHERE user_id = ? 
             AND DATE(time_in) = CURRENT_DATE 
             AND time_out IS NULL`,
            [req.user.uid]
        );

        if (existing.length === 0) {
            // Clock in
            await pool.execute(
                'INSERT INTO attendance (user_id) VALUES (?)',
                [req.user.uid]
            );
            res.json({ message: 'Clocked in successfully' });
        } else {
            // Clock out
            await pool.execute(
                `UPDATE attendance 
                 SET time_out = CURRENT_TIMESTAMP,
                 total_hours = TIMESTAMPDIFF(SECOND, time_in, CURRENT_TIMESTAMP) / 3600,
                 status = 'completed'
                 WHERE id = ?`,
                [existing[0].id]
            );
            res.json({ message: 'Clocked out successfully' });
        }
    } catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all attendance records
app.get('/api/attendance', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.email,
                a.time_in,
                a.time_out,
                a.total_hours
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            ORDER BY a.time_in DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user's attendance history
app.get('/api/attendance/:userId', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM attendance 
             WHERE user_id = ? 
             ORDER BY time_in DESC`,
            [req.params.userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching attendance:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create users table if not exists
app.get('/api/setup', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                firebase_uid VARCHAR(128) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'intern',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Insert test user with firebase_uid
        await pool.query(
            'INSERT INTO users (firebase_uid, email, full_name) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
            ['test_firebase_uid', 'test@example.com', 'Test User']
        );
        res.json({ message: 'Users table is set up' });
    } catch (error) {
        console.error('Error setting up table:', error);
        res.status(500).json({ error: 'Error setting up table' });
    }
});
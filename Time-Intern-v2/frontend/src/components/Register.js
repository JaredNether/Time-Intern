import React, { useState } from 'react';
import { auth } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';

const SCRIPT_URL = process.env.REACT_APP_SCRIPT_URL;

const Register = ({ switchToLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [hoursRequired, setHoursRequired] = useState('');
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const response = await fetch(`${SCRIPT_URL}`, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    action: 'register',
                    uid: result.user.uid,
                    email: email,
                    full_name: fullName,
                    hours_required: parseFloat(hoursRequired)
                })
            });

            console.log('Registration response:', response);
            
            // Force setup of sheets after registration
            await fetch(`${SCRIPT_URL}?action=setup`, { mode: 'no-cors' });

        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="auth-form-container">
            <h2>Register</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-form">
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <input
                    type="text"
                    placeholder="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                />
                <input
                    type="number"
                    placeholder="Required Hours"
                    value={hoursRequired}
                    onChange={(e) => setHoursRequired(e.target.value)}
                    min="0"
                    step="0.01"
                    required
                />
                <button type="submit">Register</button>
            </form>
            <button className="link-button" onClick={switchToLogin}>
                Already have an account? Login
            </button>
        </div>
    );
};

export default Register;

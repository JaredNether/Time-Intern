import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpdYSG17BE3rIfBFnaGN4xRXJwj0U2-UsGE3-YyqtHEvIAflphWGQzW4POLnDWXu5FEQ/exec';

const Register = ({ switchToLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fullName.trim()) {
            setError('Full name is required');
            return;
        }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Log registration attempt
            console.log('Registering user:', {
                uid: userCredential.user.uid,
                email: email,
                full_name: fullName
            });

            const response = await fetch(`${SCRIPT_URL}`, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    action: 'register',
                    uid: userCredential.user.uid,
                    email: email,
                    full_name: fullName
                })
            });

            console.log('Registration response:', response);
            
            // Force setup of sheets after registration
            await fetch(`${SCRIPT_URL}?action=setup`, { mode: 'no-cors' });

        } catch (error) {
            console.error('Registration error:', error);
            setError(error.message);
        }
    };

    return (
        <div className="auth-form-container">
            <h2>Register</h2>
            <form onSubmit={handleSubmit} className="auth-form">
                <input
                    type="text"
                    placeholder="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                />
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
                <button type="submit">Register</button>
                {error && <p className="error-message">{error}</p>}
            </form>
            <p>
                Already have an account?{' '}
                <button onClick={switchToLogin} className="link-button">
                    Login
                </button>
            </p>
        </div>
    );
};

export default Register;

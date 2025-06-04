import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase/config';
import Login from './components/Login';
import Register from './components/Register';
import QRGeneratorPage from './pages/QRGeneratorPage';
import QRScannerPage from './pages/QRScannerPage';

const SCRIPT_URL = process.env.REACT_APP_SCRIPT_URL;

function App() {
    const [user, loading] = useAuthState(auth);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [lastScannedCode, setLastScannedCode] = useState(null);

    // Add isAdmin check
    const isAdmin = user?.email === process.env.REACT_APP_ADMIN_EMAIL;

    const handleScan = async (qrData) => {
        try {
            let parsedQrData;
            try {
                parsedQrData = JSON.parse(qrData);
                
                // Validate QR code format
                if (!parsedQrData.code || !parsedQrData.timestamp || !parsedQrData.uid) {
                    throw new Error('Invalid QR code format');
                }

                // Check if this is the same code that was just scanned
                if (lastScannedCode === parsedQrData.code) {
                    setError('Please wait for a new QR code before scanning again');
                    return;
                }

                // Check if QR code is expired (older than 5 seconds)
                if (Date.now() - parsedQrData.timestamp > 5000) {
                    setError('This QR code has expired. Please use a new one.');
                    return;
                }

                // Store the scanned code
                setLastScannedCode(parsedQrData.code);

            } catch (parseError) {
                setError('Invalid QR code');
                return;
            }

            const response = await fetch(`${SCRIPT_URL}`, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({ 
                    action: 'attendance',
                    qr_data: parsedQrData.code,
                    user_email: user.email,
                    uid: user.uid,
                    timestamp: new Date().toISOString()
                }),
            });

            setMessage('Attendance recorded');
            setError(null);
        } catch (error) {
            console.error('Detailed error:', error);
            setError('Failed to connect to the server. Please try again.');
            setMessage(null);
        }
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return (
            <div className="app-container">
                <img src="/app-logo.png" alt="Logo" className="app-logo" />
                {isRegistering ? (
                    <Register switchToLogin={() => setIsRegistering(false)} />
                ) : (
                    <Login switchToRegister={() => setIsRegistering(true)} />
                )}
            </div>
        );
    }

    return (
        <Router>
            <div className="app-container">
                <header className="app-header">
                    <img src="/app-logo.png" alt="Logo" className="header-logo" />
                    <p>Welcome, {user.displayName || user.email}</p>
                    <button onClick={() => auth.signOut()}>Sign Out</button>
                </header>

                {message && <div className="success-message">{message}</div>}
                {error && <div className="error-message">{error}</div>}

                <Routes>
                    {isAdmin ? (
                        <>
                            <Route 
                                path="/generate" 
                                element={<QRGeneratorPage userId={user.uid} />} 
                            />
                            <Route 
                                path="/" 
                                element={<Navigate to="/generate" replace />} 
                            />
                        </>
                    ) : (
                        <>
                            <Route 
                                path="/scan" 
                                element={<QRScannerPage onScan={handleScan} />} 
                            />
                            <Route 
                                path="/" 
                                element={<Navigate to="/scan" replace />} 
                            />
                        </>
                    )}
                    {/* Catch unauthorized access attempts */}
                    <Route 
                        path="*" 
                        element={<Navigate to="/" replace />} 
                    />
                </Routes>
            </div>
        </Router>
    );
}

export default App;


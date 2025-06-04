import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const QRCodeDisplay = ({ userId }) => {
    const [qrUrl, setQrUrl] = useState('');
    const [qrExpiry, setQrExpiry] = useState(null);
    const [error, setError] = useState(null);
    const QR_REFRESH_INTERVAL = 5000; // 5 seconds in milliseconds

    useEffect(() => {
        const generateQR = async () => {
            try {
                if (!userId) {
                    throw new Error('User ID is required');
                }

                const timestamp = Date.now();
                const uniqueId = Math.random().toString(36).substring(2, 15);
                const qrData = JSON.stringify({
                    uid: userId,
                    timestamp: timestamp,
                    code: uniqueId
                });
                
                console.log('Generating QR code with data:', qrData); // Debug log
                
                const url = await QRCode.toDataURL(qrData, {
                    errorCorrectionLevel: 'H',
                    margin: 1,
                    width: 256
                });
                
                setQrUrl(url);
                setQrExpiry(new Date(timestamp + QR_REFRESH_INTERVAL));
                setError(null);
            } catch (err) {
                console.error('Error generating QR code:', err);
                setError('Failed to generate QR code');
            }
        };

        generateQR();
        const interval = setInterval(generateQR, QR_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [userId]);

    // Update the time left calculation for seconds
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
        const timer = setInterval(() => {
            if (qrExpiry) {
                const now = new Date();
                const diff = qrExpiry - now;
                if (diff > 0) {
                    const seconds = Math.ceil(diff / 1000);
                    setTimeLeft(`Expires in: ${seconds} second${seconds !== 1 ? 's' : ''}`);
                } else {
                    setTimeLeft('');
                }
            }
        }, 100); // Update more frequently for smooth countdown
        return () => clearInterval(timer);
    }, [qrExpiry]);

    if (error) {
        return <div className="error-message">{error}</div>;
    }

    return (
        <div className="qr-code-container">
           
            {qrUrl ? (
                <>
                    <img src={qrUrl} alt="QR Code" style={{ maxWidth: '256px' }} />
                    <p className="qr-expiry">{timeLeft}</p>
                </>
            ) : (
                <p></p>
            )}
        </div>
    );
};

export default QRCodeDisplay;

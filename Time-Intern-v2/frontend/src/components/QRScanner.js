import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const QRScanner = ({ onScan }) => {
    const [scanner, setScanner] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const html5QrCode = new Html5Qrcode("qr-reader");
        setScanner(html5QrCode);

        const startScanner = async () => {
            try {
                const cameras = await Html5Qrcode.getCameras();
                if (cameras && cameras.length > 0) {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 }
                        },
                        (decodedText) => {
                            onScan(decodedText);
                        },
                        (error) => {
                            // Ignore frequent errors during scanning
                            console.log(error);
                        }
                    );
                } else {
                    setError("No cameras found");
                }
            } catch (err) {
                setError("Failed to start scanner: " + err.message);
                console.error("Error starting scanner:", err);
            }
        };

        startScanner();

        // Cleanup
        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(err => {
                    console.error("Error stopping scanner:", err);
                });
            }
        };
    }, [onScan]);

    return (
        <div className="qr-scanner">
            {error && <div className="error-message">{error}</div>}
            <div id="qr-reader"></div>
        </div>
    );
};

export default QRScanner;

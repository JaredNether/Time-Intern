import React from 'react';
import { useNavigate } from 'react-router-dom';
import QRScanner from '../components/QRScanner';

const QRScannerPage = ({ onScan }) => {
    const navigate = useNavigate();

    return (
        <div className="page-container">
            
            <QRScanner onScan={onScan} />
            <button 
                className="nav-button"
                onClick={() => navigate('/generate')}
            >
                Go to QR CODE
            </button>
        </div>
    );
};

export default QRScannerPage;

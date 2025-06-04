import React from 'react';
import { useNavigate } from 'react-router-dom';
import QRCodeDisplay from '../components/QRCodeDisplay';

const QRGeneratorPage = ({ userId }) => {
    const navigate = useNavigate();

    return (
        <div className="page-container">
            <h2>Generate QR Code</h2>
            <QRCodeDisplay userId={userId} />
            <button 
                className="nav-button"
                onClick={() => navigate('/scan')}
            >
                Go to Scanner
            </button>
        </div>
    );
};

export default QRGeneratorPage;

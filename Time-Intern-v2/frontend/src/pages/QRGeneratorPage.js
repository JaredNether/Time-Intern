import React from 'react';
import QRCodeDisplay from '../components/QRCodeDisplay';

const QRGeneratorPage = ({ userId }) => {
    return (
        <div className="page-container">
            <h2>Generate QR Code</h2>
            <QRCodeDisplay userId={userId} />
        </div>
    );
};

export default QRGeneratorPage;

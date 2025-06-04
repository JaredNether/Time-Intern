import React from 'react';
import QRScanner from '../components/QRScanner';

const QRScannerPage = ({ onScan }) => {
    return (
        <div className="page-container">
            <QRScanner onScan={onScan} />
        </div>
    );
};

export default QRScannerPage;

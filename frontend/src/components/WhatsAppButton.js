import React from 'react';
import './WhatsAppButton.css';

const WhatsAppButton = ({ phoneNumber = '5513997501798', message = 'Olá, preciso de suporte no Anota & Ganha' }) => {
  const handleClick = () => {
    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappURL, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      className="whatsapp-button-float"
      onClick={handleClick}
      title="Suporte via WhatsApp"
      aria-label="Abrir WhatsApp"
    >
      <svg viewBox="0 0 32 32" fill="white" width="28" height="28">
        <path d="M16 0c-8.837 0-16 7.163-16 16 0 2.825 0.737 5.607 2.137 8.048l-2.137 7.952 7.933-2.127c2.42 1.37 5.173 2.127 8.067 2.127 8.837 0 16-7.163 16-16s-7.163-16-16-16zM16 29.467c-2.482 0-4.908-0.646-7.07-1.87l-0.507-0.292-4.713 1.262 1.262-4.669-0.292-0.508c-1.207-2.100-1.847-4.507-1.847-6.924 0-7.435 6.052-13.487 13.487-13.487s13.487 6.052 13.487 13.487c0 7.435-6.052 13.487-13.487 13.487zM21.12 18.384c-0.366-0.184-2.154-1.062-2.489-1.184s-0.577-0.184-0.82 0.184c-0.243 0.366-0.943 1.184-1.155 1.427s-0.426 0.275-0.791 0.092c-0.366-0.184-1.545-0.57-2.943-1.815-1.087-0.97-1.822-2.166-2.035-2.532s-0.022-0.564 0.161-0.746c0.165-0.165 0.366-0.426 0.548-0.64s0.243-0.366 0.366-0.609c0.122-0.243 0.061-0.458-0.031-0.64s-0.82-1.973-1.124-2.701c-0.296-0.708-0.598-0.611-0.82-0.622-0.212-0.010-0.458-0.012-0.701-0.012s-0.64 0.092-0.976 0.458c-0.335 0.366-1.276 1.247-1.276 3.040s1.307 3.527 1.489 3.771c0.184 0.243 2.579 3.936 6.251 5.519 0.873 0.378 1.555 0.603 2.085 0.771 0.878 0.279 1.677 0.24 2.308 0.145 0.704-0.105 2.154-0.881 2.458-1.733s0.305-1.581 0.214-1.733c-0.092-0.153-0.335-0.243-0.701-0.426z"/>
      </svg>
      <span className="whatsapp-pulse"></span>
    </button>
  );
};

export default WhatsAppButton;
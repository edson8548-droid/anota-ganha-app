// src/components/ErrorBoundary.js
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          marginTop: '100px',
          maxWidth: '600px',
          margin: '100px auto',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h1 style={{ color: '#e74c3c', marginBottom: '20px' }}>
            Ops! Algo deu errado 😕
          </h1>
          <p style={{ color: '#666', marginBottom: '30px', fontSize: '16px' }}>
            Não se preocupe, isso pode acontecer. Tente recarregar a página.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              cursor: 'pointer',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              marginRight: '10px',
              transition: 'background-color 0.3s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#2980b9'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#3498db'}
          >
            🔄 Recarregar Página
          </button>
          <button 
            onClick={() => window.location.href = '/'}
            style={{
              padding: '12px 30px',
              fontSize: '16px',
              cursor: 'pointer',
              backgroundColor: '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              transition: 'background-color 0.3s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#7f8c8d'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#95a5a6'}
          >
            🏠 Voltar ao Início
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div style={{
              marginTop: '30px',
              padding: '20px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              textAlign: 'left',
              fontSize: '14px',
              color: '#e74c3c',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              <strong>Erro (apenas em desenvolvimento):</strong>
              <pre style={{ marginTop: '10px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

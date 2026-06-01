import React from 'react';
import { AuthProvider } from './AuthContext';
import { SubscriptionProvider } from './SubscriptionContext';

export default function AuthenticatedProviders({ children }) {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        {children}
      </SubscriptionProvider>
    </AuthProvider>
  );
}

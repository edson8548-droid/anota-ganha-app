// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Monitorar estado de autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Buscar dados adicionais do Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            ...userData
          });
        } catch (err) {
          console.error('Erro ao buscar dados do usuário:', err);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Login
  const login = async (email, password) => {
    try {
      setError(null);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (err) {
      console.error('Erro no login:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  // Registro
  const register = async (email, password, name) => {
    try {
      setError(null);
      
      // Criar usuário
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Atualizar perfil
      await updateProfile(userCredential.user, {
        displayName: name
      });

      // Criar documento no Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: email,
        name: name,
        displayName: name,
        role: 'user',
        license_type: 'trial',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
        created_at: new Date(),
        updated_at: new Date()
      });

      return userCredential.user;
    } catch (err) {
      console.error('Erro no registro:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error('Erro no logout:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  // Reset de senha
  const resetPassword = async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      console.error('Erro ao enviar email de reset:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  // Atualizar perfil
  const updateUserProfile = async (data) => {
    try {
      if (!user) throw new Error('Usuário não autenticado');
      
      // Atualizar no Firebase Auth
      if (data.displayName || data.photoURL) {
        await updateProfile(auth.currentUser, {
          displayName: data.displayName || user.displayName,
          photoURL: data.photoURL || user.photoURL
        });
      }

      // Atualizar no Firestore
      await setDoc(doc(db, 'users', user.uid), {
        ...data,
        updated_at: new Date()
      }, { merge: true });

      return true;
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  };

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    resetPassword,
    updateUserProfile,
    isAuthenticated: !!user
  };
};

// Mensagens de erro amigáveis
const getErrorMessage = (errorCode) => {
  const errorMessages = {
    'auth/user-not-found': 'Usuário não encontrado',
    'auth/wrong-password': 'Senha incorreta',
    'auth/invalid-email': 'Email inválido',
    'auth/user-disabled': 'Usuário desativado',
    'auth/email-already-in-use': 'Este email já está cadastrado',
    'auth/weak-password': 'Senha muito fraca. Use no mínimo 6 caracteres',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde',
    'auth/invalid-credential': 'Credenciais inválidas'
  };

  return errorMessages[errorCode] || 'Ocorreu um erro. Tente novamente';
};
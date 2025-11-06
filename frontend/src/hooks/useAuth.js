// SUBSTITUA: src/hooks/useAuth.js
// ⭐️ VERSÃO 3: Adiciona a gravação de CPF e Telefone durante o registo

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

  // Monitorar estado de autenticação (Mantido da v2)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          const isAdmin = userData?.role === 'admin';
          console.log(`[Auth] Utilizador ${firebaseUser.email} é Admin? ${isAdmin}`);

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            ...userData,
            isAdmin: isAdmin 
          });
        } catch (err) {
          console.error('Erro ao buscar dados do usuário:', err);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            isAdmin: false 
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Login (Mantido)
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

  // ⭐️ INÍCIO DA ALTERAÇÃO (PASSO 2) ⭐️
  // A função agora recebe 'additionalData' (que contém nome, cpf e telefone)
  const register = async (email, password, additionalData) => {
    try {
      setError(null);
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Define o nome no perfil de autenticação
      await updateProfile(userCredential.user, {
        displayName: additionalData.name 
      });

      // ⭐️ Guarda os dados (incluindo CPF e Telefone) no Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: email,
        name: additionalData.name,
        displayName: additionalData.name,
        cpf: additionalData.cpf,         // ⭐️ NOVO CAMPO
        telefone: additionalData.telefone, // ⭐️ NOVO CAMPO
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
  // ⭐️ FIM DA ALTERAÇÃO ⭐️

  // Logout (Mantido)
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

  // Reset de senha (Mantido)
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

  // Atualizar perfil (Mantido)
  const updateUserProfile = async (data) => {
    try {
      if (!user) throw new Error('Usuário não autenticado');
      
      if (data.displayName || data.photoURL) {
        await updateProfile(auth.currentUser, {
          displayName: data.displayName || user.displayName,
          photoURL: data.photoURL || user.photoURL
        });
      }

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

// Mensagens de erro amigáveis (Mantido)
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
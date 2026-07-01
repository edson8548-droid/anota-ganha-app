// SUBSTITUA: src/hooks/useAuth.js
// ⭐️ VERSÃO 3: Adiciona a gravação de CPF e Telefone durante o registo

import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { isValidCPF, onlyDigits } from '../utils/documentValidators';
import { registerDeviceSession } from '../utils/deviceSession';
import { sendVerificationEmail } from '../utils/emailVerification';
import { registerUser } from '../services/api';

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
          const requiresEmailVerification = Boolean(userData?.requiresEmailVerification);
          const emailVerified = firebaseUser.emailVerified || userData?.emailVerified === true;
          
          const isAdmin = userData?.role === 'admin';
          console.log(`[Auth] Usuário autenticado. Admin? ${isAdmin}`);

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            ...userData,
            emailVerified,
            requiresEmailVerification,
            isAdmin: isAdmin 
          });

          if (!requiresEmailVerification || emailVerified) {
            registerDeviceSession().catch((sessionErr) => {
              console.warn('[Auth] Não foi possível registrar dispositivo:', sessionErr?.message || sessionErr);
            });
          }
        } catch (err) {
          console.error('Erro ao buscar dados do usuário:', err);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            emailVerified: firebaseUser.emailVerified,
            requiresEmailVerification: false,
            isAdmin: false 
          });

          registerDeviceSession().catch((sessionErr) => {
            console.warn('[Auth] Não foi possível registrar dispositivo:', sessionErr?.message || sessionErr);
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

      const cpf = onlyDigits(additionalData?.cpf);
      const telefone = onlyDigits(additionalData?.telefone);

      if (!isValidCPF(cpf)) {
        const invalidCpfError = new Error('CPF inválido');
        invalidCpfError.code = 'auth/invalid-cpf';
        throw invalidCpfError;
      }

      if (telefone.length < 10 || telefone.length > 11) {
        const invalidPhoneError = new Error('Telefone inválido');
        invalidPhoneError.code = 'auth/invalid-phone';
        throw invalidPhoneError;
      }
      
      await registerUser({
        email,
        password,
        name: additionalData.name,
        cpf,
        telefone,
        ...(additionalData?.referralCode ? { referral_code: additionalData.referralCode } : {}),
      });

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (additionalData.name && userCredential.user.displayName !== additionalData.name) {
        await updateProfile(userCredential.user, { displayName: additionalData.name });
      }
      try {
        await sendVerificationEmail(userCredential.user);
      } catch (verificationErr) {
        console.warn('[Register] Não foi possível enviar email de confirmação:', verificationErr?.message || verificationErr);
      }

      return userCredential.user;
    } catch (err) {
      console.error('Erro no registro:', err);
      const backendMessage = err?.response?.data?.detail;
      if (backendMessage && !err.code) err.code = 'backend/register';
      setError(backendMessage || getErrorMessage(err.code));
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

  const refreshCurrentUser = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;

    await firebaseUser.reload();
    await firebaseUser.getIdToken(true);
    setUser(prev => prev
      ? {
          ...prev,
          emailVerified: firebaseUser.emailVerified,
        }
      : {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          requiresEmailVerification: false,
          isAdmin: false,
        }
    );
    return firebaseUser;
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

      const safeData = {};
      if (data.displayName) {
        safeData.displayName = data.displayName;
        safeData.name = data.displayName;
        safeData.nome = data.displayName;
      }
      if (data.photoURL) safeData.photoURL = data.photoURL;

      await setDoc(doc(db, 'users', user.uid), {
        ...safeData,
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
    refreshCurrentUser,
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
    'auth/invalid-credential': 'Credenciais inválidas',
    'auth/invalid-cpf': 'CPF inválido. Verifique o número digitado.',
    'auth/invalid-phone': 'Telefone inválido. Inclua o DDD.'
  };

  return errorMessages[errorCode] || 'Ocorreu um erro. Tente novamente';
};

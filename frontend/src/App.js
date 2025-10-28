import React from "react";
import './App.css';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PrivateRoute } from "./components/PrivateRoute";
import InstallPWA from "./components/InstallPWA";
import WhatsAppButton from "./components/WhatsAppButton";
// import Login from "./pages/Login";
// import Dashboard from "./pages/Dashboard";
// import AdminPanel from "./pages/AdminPanel";
// import Pricing from "./pages/Pricing";
// import MySubscription from "./pages/MySubscription";
// import PaymentSuccess from "./pages/PaymentSuccess";
// import PaymentFailure from "./pages/PaymentFailure";
// import PaymentPending from "./pages/PaymentPending";
// import ForgotPassword from "./pages/ForgotPassword";
// import ResetPassword from "./pages/ResetPassword";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ROTAS TEMPORARIAMENTE DESABILITADAS PARA TESTE */}
          {/* <Route path="/login" element={<Login />} /> */}
          {/* <Route path="/forgot-password" element={<ForgotPassword />} /> */}
          {/* <Route path="/reset-password" element={<ResetPassword />} /> */}
          {/* <Route
            path="/"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminPanel />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/pricing"
            element={
              <PrivateRoute>
                <Pricing />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/my-subscription"
            element={
              <PrivateRoute>
                <MySubscription />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/payment/success"
            element={
              <PrivateRoute>
                <PaymentSuccess />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/payment/failure"
            element={
              <PrivateRoute>
                <PaymentFailure />
              </PrivateRoute>
            }
          /> */}
          {/* <Route
            path="/payment/pending"
            element={
              <PrivateRoute>
                <PaymentPending />
              </PrivateRoute>
            }
          /> */}
          
          {/* ROTA TEMPORÁRIA DE TESTE */}
          <Route path="*" element={<div style={{padding: '20px', textAlign: 'center'}}><h1>Build de Teste - OK!</h1><p>Páginas temporariamente desabilitadas</p></div>} />
        </Routes>
        <InstallPWA />
        <WhatsAppButton />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

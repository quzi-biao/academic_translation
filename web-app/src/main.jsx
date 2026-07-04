import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'katex/dist/katex.min.css';
import './styles.css';

import { RequireAuth } from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import DocumentPage from './pages/DocumentPage';
import DocumentEditPage from './pages/DocumentEditPage';
import WalletPage from './pages/WalletPage';

function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<LoginPage mode="register" />} />
    <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
    <Route path="/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
    <Route path="/documents/:id" element={<RequireAuth><DocumentPage /></RequireAuth>} />
    <Route path="/documents/:id/edit" element={<RequireAuth><DocumentEditPage /></RequireAuth>} />
    <Route path="/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<App />);

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { AppDataProvider } from './contexts/AppDataContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import PaymentReturn from './pages/PaymentReturn';
import NotFound from './pages/NotFound';

// User Imports
import UserLayout from './pages/user/UserLayout';
import UserDashboard from './pages/user/UserDashboard';
import Catalog from './pages/user/Catalog';
import MyCredentials from './pages/user/MyCredentials';
import Billing from './pages/user/Billing';
import Checkout from './pages/user/Checkout';
import ServiceCredentials from './pages/user/ServiceCredentials';

// Admin Imports
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import Users from './pages/admin/Users';
import UserDetail from './pages/admin/UserDetail';
import Platforms from './pages/admin/Platforms';
import Subscriptions from './pages/admin/Subscriptions';
import Groups from './pages/admin/Groups';
import GroupForm from './pages/admin/GroupForm';
import Credentials from './pages/admin/Credentials';
import Support from './pages/admin/Support';
import Announcements from './pages/admin/Announcements';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/payment/return" element={<PaymentReturn />} />

            {/* User Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><UserLayout /></ProtectedRoute>}>
              <Route index element={<UserDashboard />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="catalog/:serviceId" element={<Catalog />} />
              <Route path="checkout/:groupId" element={<Checkout />} />
              <Route path="credentials" element={<MyCredentials />} />
              <Route path="credentials/:serviceId" element={<ServiceCredentials />} />
              <Route path="billing" element={<Billing />} />
            </Route>

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:userId" element={<UserDetail />} />
            <Route path="platforms" element={<Platforms />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/new" element={<GroupForm />} />
            <Route path="groups/:groupId/edit" element={<GroupForm />} />
            <Route path="credentials" element={<Credentials />} />
            <Route path="support" element={<Support />} />
            <Route path="announcements" element={<Announcements />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AppDataProvider>
    </AuthProvider>
  );
}

export default App;

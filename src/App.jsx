import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { AppDataProvider } from './contexts/AppDataContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
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
import UserSupport from './pages/user/Support';
import CreateTicket from './pages/user/CreateTicket';
import TicketDetail from './pages/user/TicketDetail';
import Share from './pages/user/Share';
import UserProfile from './pages/user/UserProfile';
import GroupDetail from './pages/user/GroupDetail';
import UserPublicProfile from './pages/user/UserPublicProfile';
import SubscriptionManage from './pages/user/SubscriptionManage';
import CreateGroup from './pages/user/CreateGroup';
import ManageGroup from './pages/user/ManageGroup';
import Wallet from './pages/user/Wallet';
import MyGroups from './pages/user/MyGroups';

// Admin Imports
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import Users from './pages/admin/Users';
import UserDetail from './pages/admin/UserDetail';
import Platforms from './pages/admin/Platforms';
import PlatformForm from './pages/admin/PlatformForm';
import Subscriptions from './pages/admin/Subscriptions';
import Groups from './pages/admin/Groups';
import GroupForm from './pages/admin/GroupForm';
import Credentials from './pages/admin/Credentials';
import Support from './pages/admin/Support';
import AdminTicketDetail from './pages/admin/AdminTicketDetail';
import Announcements from './pages/admin/Announcements';
import InterestList from './pages/admin/InterestList';
import Settings from './pages/admin/Settings';
import AdminWallets from './pages/admin/Wallets';

import './App.css';

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <AppDataProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/payment/return" element={<PaymentReturn />} />
            <Route path="/checkout/:groupSlug" element={<Checkout />} />

            {/* User Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><UserLayout /></ProtectedRoute>}>
              <Route index element={<UserDashboard />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="catalog/:serviceId" element={<Catalog />} />
              <Route path="checkout/:groupSlug" element={<Checkout />} />
              <Route path="credentials" element={<MyCredentials />} />
              <Route path="credentials/:serviceId" element={<ServiceCredentials />} />
              <Route path="billing" element={<Billing />} />
              <Route path="wallet" element={<Wallet />} />
              <Route path="my-groups" element={<MyGroups />} />
              <Route path="my-groups/create" element={<CreateGroup />} />
              <Route path="my-groups/:groupId/manage" element={<ManageGroup />} />
              <Route path="support" element={<UserSupport />} />
              <Route path="support/new" element={<CreateTicket />} />
              <Route path="support/:ticketId" element={<TicketDetail />} />
              <Route path="share" element={<Share />} />
              <Route path="profile" element={<UserProfile />} />
              <Route path="groups/:groupSlug" element={<GroupDetail />} />
              <Route path="user/:userId" element={<UserPublicProfile />} />
              <Route path="subscription/:subscriptionId" element={<SubscriptionManage />} />
            </Route>

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:userId" element={<UserDetail />} />
            <Route path="platforms" element={<Platforms />} />
            <Route path="platforms/new" element={<PlatformForm />} />
            <Route path="platforms/:platformId/edit" element={<PlatformForm />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="groups" element={<Groups />} />
            <Route path="groups/new" element={<GroupForm />} />
            <Route path="groups/:groupId/edit" element={<GroupForm />} />
            <Route path="credentials" element={<Credentials />} />
            <Route path="support" element={<Support />} />
            <Route path="support/:ticketId" element={<AdminTicketDetail />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="interest" element={<InterestList />} />
            <Route path="wallets" element={<AdminWallets />} />
            <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </AppDataProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

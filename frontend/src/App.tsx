import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';



import DashboardLayout from '@/components/dashboard/DashboardLayout';

import ProtectedRoute from '@/components/ProtectedRoute';

import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import AdminOrdersPage from '@/pages/admin/AdminOrdersPage';
import AdminProductsPage from '@/pages/admin/AdminProductsPage';
import AdminSuppliersPage from '@/pages/admin/AdminSuppliersPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';

import Login from '@/pages/auth/Login';

import Register from '@/pages/auth/Register';

import NotFoundPage from '@/pages/errors/NotFoundPage';

import UnauthorizedPage from '@/pages/errors/UnauthorizedPage';

import HomePage from '@/pages/HomePage';

import Cart from '@/pages/hospital/Cart';

import Checkout from '@/pages/hospital/Checkout';

import HospitalDashboardPage from '@/pages/hospital/HospitalDashboardPage';

import OrderDetail from '@/pages/hospital/OrderDetail';

import Catalog from '@/pages/marketplace/Catalog';

import ProductDetail from '@/pages/marketplace/ProductDetail';

import SupplierDashboardPage from '@/pages/supplier/SupplierDashboardPage';

import SupplierOrderDetailPage from '@/pages/supplier/SupplierOrderDetailPage';
import SupplierOrdersPage from '@/pages/supplier/SupplierOrdersPage';

import SupplierBatchFormPage from '@/pages/supplier/SupplierBatchFormPage';
import SupplierProductBatchesPage from '@/pages/supplier/SupplierProductBatchesPage';
import SupplierProductFormPage from '@/pages/supplier/SupplierProductFormPage';

import SupplierProductsPage from '@/pages/supplier/SupplierProductsPage';



/** Application route definitions with role-based protected routes. */

const App = () => (

  <BrowserRouter>

    <Routes>

      <Route path="/login" element={<Login />} />

      <Route path="/register" element={<Register />} />

      <Route path="/unauthorized" element={<UnauthorizedPage />} />



      <Route element={<ProtectedRoute />}>

        <Route index element={<HomePage />} />



        {/* Legacy redirects */}

        <Route path="hospital" element={<Navigate to="/hospital/dashboard" replace />} />

        <Route path="supplier" element={<Navigate to="/supplier/dashboard" replace />} />

        <Route path="admin" element={<Navigate to="/admin/dashboard" replace />} />



        <Route element={<ProtectedRoute requiredRole="HOSPITAL" />}>

          <Route element={<DashboardLayout title="Hospital Dashboard" />}>

            <Route path="hospital/dashboard" element={<HospitalDashboardPage />} />

            <Route path="hospital/cart" element={<Cart />} />

            <Route path="hospital/checkout" element={<Checkout />} />

            <Route path="hospital/orders/:orderId" element={<OrderDetail />} />

            <Route path="marketplace" element={<Catalog />} />

            <Route path="marketplace/products/:productId" element={<ProductDetail />} />

          </Route>

        </Route>



        <Route element={<ProtectedRoute requiredRole="SUPPLIER" />}>

          <Route element={<DashboardLayout title="Supplier Dashboard" />}>

            <Route path="supplier/dashboard" element={<SupplierDashboardPage />} />

            <Route path="supplier/products" element={<SupplierProductsPage />} />

            <Route path="supplier/products/new" element={<SupplierProductFormPage />} />

            <Route path="supplier/products/:productId/edit" element={<SupplierProductFormPage />} />
            <Route path="supplier/products/:productId/batches" element={<SupplierProductBatchesPage />} />
            <Route path="supplier/products/:productId/batches/new" element={<SupplierBatchFormPage />} />
            <Route path="supplier/products/:productId/batches/:batchId/edit" element={<SupplierBatchFormPage />} />

            <Route path="supplier/orders" element={<SupplierOrdersPage />} />
            <Route path="supplier/orders/:orderId" element={<SupplierOrderDetailPage />} />

          </Route>

        </Route>



        <Route element={<ProtectedRoute requiredRole="ADMIN" />}>

          <Route element={<DashboardLayout title="Admin Dashboard" />}>

            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/suppliers" element={<AdminSuppliersPage />} />
            <Route path="admin/products" element={<AdminProductsPage />} />
            <Route path="admin/orders" element={<AdminOrdersPage />} />

          </Route>

        </Route>

      </Route>



      <Route path="*" element={<NotFoundPage />} />

    </Routes>

  </BrowserRouter>

);



export default App;



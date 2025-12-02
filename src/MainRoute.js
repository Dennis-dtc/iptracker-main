import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import AdminLogin from "./Utils/AdminLogin";
import LandingAuth from "./Utils/LandingAuth";
import Dashboard from "./dashboard";
import ProtectedAdminRoutes from "./Utils/ProtectedAdminRoutes";

function MainRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LandingAuth />} path="/" />
        <Route element={<AdminLogin />} path="/admin-login" />
        <Route element={<App />} path="/app" />

        {/* Only admin can access */}
        <Route element={<ProtectedAdminRoutes />}>
          <Route element={<Dashboard />} path="/admin_dashboard" />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default MainRouter;

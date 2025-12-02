import { Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getAdminProfile } from "../services/adminService";

const ProtectedAdminRoutes = () => {
  const [loading, setLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const profile = await getAdminProfile("superadmin"); // fixed UID
      if (profile && profile.role === "admin") {
        setIsAllowed(true);
      } else {
        setIsAllowed(false);
      }
      setLoading(false);
    };

    checkAccess();
  }, []);

  if (loading) return null; // or spinner

  return isAllowed ? <Outlet /> : <Navigate to="/" replace />;
};

export default ProtectedAdminRoutes;

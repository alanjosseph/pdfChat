import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getToken } from "../auth";

export default function RequireAuth() {
    const token = getToken();
    const locations = useLocation();

    console.log("RequireAuth: token =", token);
    console.log("RequireAuth: location =", locations);
    if (!token) {
        return <Navigate to="/" state={{ from: locations }} replace />;
    }

    return <Outlet />;
}
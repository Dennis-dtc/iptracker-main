// src/dashboard.js
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import ModalPanel from "./components/ModalPanel";
import WeeklyGraph from "./components/WeeklyGraph";
import DataTable from "./components/DataTable";
import CleanerDetailModal from "./components/CleanerDetailModal";

import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  query,
  where
} from "firebase/firestore";

import {
  getIncomePerCleaner,
  getRatingsPerCleaner
} from "./services/reportService";

import { firestore as db } from "./firebaseConfig";
import { updateBookingStatus } from "./services/bookingService";

/** ---------- Helpers ---------- */

// Convert Firestore Timestamp / millis / ISO string to JS Date safely
function toDateSafe(ts) {
  if (!ts) return null;
  if (ts.toDate && typeof ts.toDate === "function") {
    return ts.toDate();
  }
  // number (seconds?) or milliseconds
  if (typeof ts === "number") {
    // Heuristic: if seconds (10-digit), convert to ms
    return ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
  }
  // ISO string
  try {
    return new Date(ts);
  } catch {
    return null;
  }
}

// human readable time difference
function timeAgo(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// format currency KSH
function formatKsh(n) {
  if (n == null) return "Ksh 0";
  const v = Number(n) || 0;
  return `Ksh ${v.toLocaleString("en-KE")}`;
}

// status icon
function statusIcon(s) {
  if (!s) return "";
  const st = s.toLowerCase();
  if (st === "closed" || st === "completed") return "✔️";
  if (st === "pending") return "⏳";
  if (st === "accepted" || st === "in-progress" || st === "working" || st === "onjob") return "🔄";
  return "ℹ️";
}

// get start of today (local)
function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ---------- Component ---------- */

export default function DashboardLayout() {
  const navigate = useNavigate();

  const [activePanel, setActivePanel] = useState("dashboard");

  // raw collections
  const [usersMap, setUsersMap] = useState({}); // id -> user
  const [cleaners, setCleaners] = useState([]); // array of cleaner users
  const [bookings, setBookings] = useState([]); // array of bookings
  const [payments, setPayments] = useState([]); // array of payments (if needed)

  // weekly stats
  const [weeklyBookings, setWeeklyBookings] = useState(new Array(7).fill(0));
  const [weeklyEarnings, setWeeklyEarnings] = useState(new Array(7).fill(0));

  // reports
  const [reports, setReports] = useState({
    incomePerCleaner: [],
    ratingsPerCleaner: []
  });

  // admin profile (fetched from users collection where role === 'admin')
  const [adminProfile, setAdminProfile] = useState(null);

  // modal selection
  const [selectedCleaner, setSelectedCleaner] = useState(null);

  // protect admin route
  useEffect(() => {
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    if (!isAdmin) navigate("/");
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem("adminSessionActive", "true");
  }, []);

  /** ---------- realtime: users (all) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const map = {};
      const cleanersList = [];
      let admin = null;
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        map[d.id] = data;
        if (data.role === "cleaner") cleanersList.push(data);
        if (!admin && data.role === "admin") admin = data;
      });
      setUsersMap(map);
      setCleaners(cleanersList);
      if (admin) setAdminProfile(admin);
    });
    return unsub;
  }, []);

  /** ---------- realtime: bookings ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(list);
    });
    return unsub;
  }, []);

  /** ---------- realtime: payments (if present) ---------- */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "payments"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPayments(list);
    });
    return unsub;
  }, []);

  /** ---------- weekly stats calculation (last 7 days) ---------- */
  useEffect(() => {
    // compute last 7-day window (including today)
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6); // 6 days before today => 7-day window

    const bookingsArr = new Array(7).fill(0);
    bookings.forEach((b) => {
      const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
      if (!d) return;
      if (d < start || d > now) return;
      const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24)); // 0..6
      if (diffDays >= 0 && diffDays < 7) bookingsArr[diffDays] += 1;
    });
    setWeeklyBookings(bookingsArr);

    const earningsArr = new Array(7).fill(0);
    // use payments if present, else use bookings.price on bookings with paid status
    if (payments && payments.length > 0) {
      payments.forEach((p) => {
        const d = toDateSafe(p.createdAt || p.created_at || p.timestamp);
        if (!d) return;
        if (d < start || d > now) return;
        const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) earningsArr[diffDays] += Number(p.amount || 0);
      });
    } else {
      bookings.forEach((b) => {
        const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
        if (!d) return;
        if (d < start || d > now) return;
        // treat completed/closed/paid bookings as revenue
        if (["closed", "completed", "paid"].includes(String(b.status).toLowerCase())) {
          const diffDays = Math.floor((d - start) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 7) earningsArr[diffDays] += Number(b.price || 0);
        }
      });
    }
    setWeeklyEarnings(earningsArr);
  }, [bookings, payments]);

  /** ---------- Reports loader (on demand) ---------- */
  const openReportsPanel = async () => {
    setActivePanel("reports");
    // We still use aggregated service functions for income/ratings
    const income = await getIncomePerCleaner();
    const ratings = await getRatingsPerCleaner();
    setReports({ incomePerCleaner: income, ratingsPerCleaner: ratings });
  };

  const endAdminSession = () => {
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminSessionActive");
    navigate("/");
  };

  // generic delete helper
  const handleDeleteDoc = async (collectionName, id) => {
    if (!window.confirm("Delete this record?")) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      alert("Delete failed");
    }
  };

  // Columns for DataTable (kept simple)
  const cleanerColumns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "rating", label: "Rating" },
    { key: "category", label: "Category" }
  ];

  const bookingColumns = [
    { key: "customerId", label: "Customer ID" },
    { key: "cleanerId", label: "Cleaner ID" },
    { key: "price", label: "Price" },
    { key: "status", label: "Status" }
  ];

  /** ---------- Derived panels data ---------- */

  // find bookings with created date; sort descending by date
  const bookingsWithDate = useMemo(() => {
    return bookings
      .map((b) => {
        const d = toDateSafe(b.createdAt || b.created_at || b.timestamp);
        return { ...b, __date: d };
      })
      .sort((a, b) => {
        const da = a.__date ? a.__date.getTime() : 0;
        const db = b.__date ? b.__date.getTime() : 0;
        return db - da;
      });
  }, [bookings]);

  // 1) Last 3 completed jobs: status === "closed"
  const completedJobs = bookingsWithDate.filter((b) => String(b.status).toLowerCase() === "closed").slice(0, 3);

  // 2) Next 3 active jobs: pending, accepted, in-progress, working, onjob
  const activeJobs = bookingsWithDate.filter((b) => {
    const st = String(b.status || "").toLowerCase();
    return ["pending", "accepted", "in-progress", "working", "onjob"].includes(st);
  }).slice(0, 3);

  // 3) Top 3 rated cleaners: derived from ratings collection (we'll compute locally from usersMap and bookings)
  // We'll compute ratings by scanning reports.ratingsPerCleaner (if available) else fallback to usersMap rating field
  const topCleaners = useMemo(() => {
    // try reports.ratingsPerCleaner first (structure {cleanerId, average, count})
    if (reports.ratingsPerCleaner && reports.ratingsPerCleaner.length > 0) {
      const arr = reports.ratingsPerCleaner
        .map((r) => {
          const user = usersMap[r.cleanerId] || {};
          const jobsCompleted = bookings.filter((b) => String(b.cleanerId) === String(r.cleanerId) && String(b.status).toLowerCase() === "closed").length;
          return {
            id: r.cleanerId,
            name: user.name || user.fullName || user.email || r.cleanerId,
            average: r.average || 0,
            count: r.count || 0,
            jobsCompleted
          };
        })
        .sort((a, b) => b.average - a.average)
        .slice(0, 3);
      return arr;
    }

    // fallback: use usersMap rating field
    const fallback = Object.values(usersMap)
      .filter((u) => u.role === "cleaner" && (u.rating || u.ratingCount))
      .map((u) => {
        const jobsCompleted = bookings.filter((b) => String(b.cleanerId) === String(u.id) && String(b.status).toLowerCase() === "closed").length;
        return {
          id: u.id,
          name: u.name || u.fullName || u.email || u.id,
          average: u.rating || 0,
          count: u.ratingCount || 0,
          jobsCompleted
        };
      })
      .sort((a, b) => b.average - a.average)
      .slice(0, 3);

    return fallback;
  }, [reports.ratingsPerCleaner, usersMap, bookings]);

  // helper to get user name by id
  const getUserName = (id) => {
    const u = usersMap[id];
    if (!u) return id || "Unknown";
    return u.name || u.fullName || u.email || id;
  };

  // helper to get booking customer name
  const getCustomerName = (booking) => {
    return getUserName(booking.customerId);
  };

  // admin profile display values (fetched from users collection where role === 'admin')
  const adminName = adminProfile?.name || adminProfile?.fullName || "Super Admin";
  const adminEmail = adminProfile?.email || "admin@domain.com";

  /** ---------- Render ---------- */
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white shadow-lg p-6 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-gray-300 mb-3"></div>
          <h2 className="text-lg font-semibold">{adminName}</h2>
          <p className="text-sm text-gray-500">{adminEmail}</p>

          <button
            onClick={endAdminSession}
            className="text-xs text-red-500 underline mt-2"
          >
            Exit Admin Mode
          </button>
        </div>

        <nav className="flex flex-col gap-3 text-gray-700">
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("dashboard")}>Dashboard</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("cleaners")}>Cleaners</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("bookings")}>Bookings</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("maps")}>Maps</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={openReportsPanel}>Reports</button>
          <button className="p-3 rounded-xl hover:bg-gray-200 text-left" onClick={() => setActivePanel("conversations")}>Conversations</button>
        </nav>
      </aside>

      {/* RIGHT PANEL */}
      <main className="flex-1 p-8 flex flex-col gap-8">
        {/* Dashboard */}
        {activePanel === "dashboard" && (
          <>
            {/* Top 3 circular stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow text-center">
                <div className="w-32 h-32 rounded-full border-4 border-gray-300 flex items-center justify-center text-4xl font-bold">
                  {bookings.length}
                </div>
                <p className="mt-4 text-gray-600">Bookings</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow text-center">
                <div className="w-32 h-32 rounded-full border-4 border-gray-300 flex items-center justify-center text-4xl font-bold">
                  {cleaners.length}
                </div>
                <p className="mt-4 text-gray-600">Cleaners</p>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow text-center">
                <div className="w-32 h-32 rounded-full border-4 border-gray-300 flex items-center justify-center text-4xl font-bold">
                  {weeklyEarnings.reduce((a, b) => a + Number(b || 0), 0).toFixed(0)}
                </div>
                <p className="mt-4 text-gray-600">Weekly Revenue</p>
              </div>
            </div>

            {/* RECTANGLES - dynamic panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Completed Jobs */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Recent Completed Jobs</h3>
                {completedJobs.length === 0 && <p className="text-gray-400 text-sm">No completed jobs yet</p>}
                {completedJobs.map((job) => {
                  const cleanerName = getUserName(job.cleanerId);
                  const date = toDateSafe(job.createdAt || job.created_at || job.timestamp);
                  return (
                    <div key={job.id} className="flex items-center justify-between border-b py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{cleanerName}</div>
                        <div className="text-xs text-gray-500">{timeAgo(date)} ago</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatKsh(job.price)}</div>
                        <div className="text-xs text-gray-500">{statusIcon(job.status)} {job.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Jobs */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Active Jobs</h3>
                {activeJobs.length === 0 && <p className="text-gray-400 text-sm">No active jobs at the moment</p>}
                {activeJobs.map((job) => {
                  const cleanerName = getUserName(job.cleanerId);
                  const customerName = getUserName(job.customerId);
                  const date = toDateSafe(job.createdAt || job.created_at || job.timestamp);
                  return (
                    <div key={job.id} className="flex items-center justify-between border-b py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{cleanerName} • {customerName}</div>
                        <div className="text-xs text-gray-500">{timeAgo(date)} ago</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatKsh(job.price)}</div>
                        <div className="text-xs text-gray-500">{statusIcon(job.status)} {job.status}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top Rated Cleaners */}
              <div className="bg-white p-4 rounded-2xl shadow h-48 overflow-auto">
                <h3 className="text-md font-semibold mb-3">Top Rated Cleaners</h3>
                {topCleaners.length === 0 && <p className="text-gray-400 text-sm">Not enough rating data yet</p>}
                {topCleaners.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b py-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-gray-500">{c.count} ratings</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{Number(c.average).toFixed(1)} ⭐</div>
                      <div className="text-xs text-gray-500">{c.jobsCompleted} jobs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GRAPHS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <WeeklyGraph title="Customers Served Per Day (last 7 days)" data={weeklyBookings} />
              <WeeklyGraph title="Money Earned Per Day (last 7 days)" data={weeklyEarnings} />
            </div>
          </>
        )}

        {/* CLEANERS panel */}
        {activePanel === "cleaners" && (
          <ModalPanel title="Cleaners" onClose={() => setActivePanel("dashboard")}>
            <DataTable
              columns={cleanerColumns}
              data={cleaners}
              onDelete={(id) => handleDeleteDoc("users", id)}
              onEdit={(row) => setSelectedCleaner(row)}
              exportFilename="cleaners.csv"
            />
          </ModalPanel>
        )}

        {/* CLEANER DETAIL */}
        {selectedCleaner && (
          <ModalPanel title="Cleaner Details" onClose={() => setSelectedCleaner(null)}>
            <CleanerDetailModal cleaner={selectedCleaner} onClose={() => setSelectedCleaner(null)} />
          </ModalPanel>
        )}

        {/* BOOKINGS panel */}
        {activePanel === "bookings" && (
          <ModalPanel title="Bookings" onClose={() => setActivePanel("dashboard")}>
            <DataTable
              columns={bookingColumns}
              data={bookings}
              onDelete={(id) => handleDeleteDoc("bookings", id)}
              onEdit={(row) => {
                const newStatus = prompt("Update status (pending, accepted, in-progress, closed, paid):", row.status);
                if (!newStatus) return;
                updateBookingStatus(row.id, newStatus);
              }}
              exportFilename="bookings.csv"
            />
          </ModalPanel>
        )}

        {/* REPORTS */}
        {activePanel === "reports" && (
          <ModalPanel title="Reports & Analytics" onClose={() => setActivePanel("dashboard")}>
            <h3 className="text-lg font-semibold mt-2 mb-2">Income Per Cleaner</h3>
            <DataTable
              columns={[
                { key: "cleanerId", label: "Cleaner ID" },
                { key: "total", label: "Total Income" }
              ]}
              data={reports.incomePerCleaner}
              exportFilename="income_per_cleaner.csv"
            />

            <h3 className="text-lg font-semibold mt-6 mb-2">Ratings Per Cleaner</h3>
            <DataTable
              columns={[
                { key: "cleanerId", label: "Cleaner ID" },
                { key: "average", label: "Average Rating" },
                { key: "count", label: "Rating Count" }
              ]}
              data={reports.ratingsPerCleaner}
              exportFilename="ratings_per_cleaner.csv"
            />
          </ModalPanel>
        )}

        {/* MAPS */}
        {activePanel === "maps" && (
          <ModalPanel title="Maps" onClose={() => setActivePanel("dashboard")}>
            <div className="h-64 flex items-center justify-center text-gray-500">Map Integration Placeholder</div>
          </ModalPanel>
        )}

        {/* CONVERSATIONS */}
        {activePanel === "conversations" && (
          <ModalPanel title="Conversations" onClose={() => setActivePanel("dashboard")}>
            <div className="h-64 flex items-center justify-center text-gray-500">Chat Logs / Conversations Placeholder</div>
          </ModalPanel>
        )}

      </main>
    </div>
  );
}

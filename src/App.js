// src/App.js
import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ManualRoute from './ManualRoute';
import ProfileForm from './components/profileform';
import DashBoard from './dashboard';
import ChatBox from './ChatBox';
import { v4 as uuidv4 } from 'uuid';

// Firebase (RTDB + Auth + Firestore)
import {
  database,
  ref as rtdbRef,
  set as rtdbSet,
  onValue,
  get as rtdbGet,
  remove as rtdbRemove,
} from './firebaseConfig';
import { auth, signInAnonymously } from './firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { firestore as db } from './firebaseConfig';

// Firestore helpers & services
import { createBooking, updateBookingStatus } from './services/bookingService';
import { getUserById } from './services/userService';
import {
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy
} from 'firebase/firestore';

// Leaflet icon helpers
const createRoleIcon = (imageUrl, role = 'cleaner') =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="marker-pin ${role}"></div>
      <div class="icon-wrapper">
        <img src="${imageUrl}" class="icon-image" alt="${role}" />
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

const userMarkerIcon = createRoleIcon(
  'https://img.icons8.com/ios-filled/50/000000/navigation.png',
  'you'
);

// ensure leaflet images resolve in CRA
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// deterministic conversation id helper
const generateConversationId = (a, b) => {
  if (!a || !b) return null;
  return [a, b].sort().join('_');
};

// Recenter hook component
function RecenterMap({ coords, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.setView(coords, map.getZoom(), { animate: true });
    }
  }, [trigger]); // trigger increments when we want to recenter
  return null;
}

const hardcodedCleaners = [
  { id: 'cleaner_1', lat: -1.29, lng: 36.82 },
  { id: 'cleaner_2', lat: -1.3, lng: 36.83 },
  { id: 'cleaner_3', lat: -1.31, lng: 36.84 },
];

function App() {
  /* -----------------------------
     SECTION 1 — Session + Profile
     ----------------------------- */
  const [user, setUser] = useState(null); // firebase auth user
  const [userRole, setUserRole] = useState(''); // 'customer' | 'cleaner' | 'viewer'
  const [sessionId, setSessionId] = useState(null); // per-tab unique session
  const [deviceId, setDeviceId] = useState(null); // browser device id
  const [userName, setUserName] = useState(''); // profile name (local)
  const [userProfile, setUserProfile] = useState(null); // fetched Firestore profile
  const [showRoleModal, setShowRoleModal] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [ShowDashboardModal, setShowDashboardModal] = useState(false);

  /* -----------------------------
     SECTION 2 — Geolocation & RTDB
     ----------------------------- */
  const [sharing, setSharing] = useState(false);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [allLocations, setAllLocations] = useState({});
  const watchIdRef = useRef(null);

  /* -----------------------------
     SECTION 3 — Requests & Jobs
     ----------------------------- */
  const [incomingRequest, setIncomingRequest] = useState(null); // for cleaners (requests/{cleanerUid})
  const [currentCustomerRequest, setCurrentCustomerRequest] = useState(null); // for customers (their outgoing request)
  const [activeJob, setActiveJob] = useState(null); // { cleanerUid, customerUid, bookingId, status, customerName, cleanerName }
  const [isAvailable, setIsAvailable] = useState(true); // cleaner availability
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRequestKey, setCurrentRequestKey] = useState(null); // path key for requests (usually cleaner uid or session)
  const [currentRequestId, setCurrentRequestId] = useState(null); // bookingId stored locally

  // tracking
  const [isTrackingCustomer, setIsTrackingCustomer] = useState(false);

  /* -----------------------------
     SECTION 4 — Map / UI
     ----------------------------- */
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [targetCoords, setTargetCoords] = useState(null); // point we want to show / route to
  const [customerCoords, setCustomerCoords] = useState(null); // for cleaners tracking customers
  const [incomingMessage, setIncomingMessage] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({});
  const [chatWith, setChatWith] = useState(null);

  /* -----------------------------
     SECTION 5 — Payment & Rating Modals (demo)
     ----------------------------- */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBookingId, setPaymentBookingId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingBookingContext, setRatingBookingContext] = useState(null); // { bookingId, cleanerId }
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  /* -----------------------------
     Cleaner profile panel
     ----------------------------- */
  const [showCleanerProfilePanel, setShowCleanerProfilePanel] = useState(false);
  const [cleanerProfile, setCleanerProfile] = useState(null);

  /* -----------------------------
     SECTION 6 — Helpers / refs
     ----------------------------- */
  const [customerNotice, setCustomerNotice] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);
  

  /* -----------------------------
     AUTH: anonymous sign-in & store auth user
     ----------------------------- */
  useEffect(() => {
    signInAnonymously(auth).catch((e) => {
      console.error('Anonymous sign-in failed', e);
    });

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      }
    });
    return () => unsub();
  }, []);

  /* -----------------------------
     DEVICE & SESSION INITIALIZATION
     ----------------------------- */
  useEffect(() => {
    let stored = localStorage.getItem('deviceId');
    if (!stored) {
      stored = uuidv4();
      localStorage.setItem('deviceId', stored);
    }
    setDeviceId(stored);
  }, []);

  const handleRoleSelect = async (role) => {
    setUserRole(role);
    setShowRoleModal(false);

    // create composite device/session ids so same browser can simulate multiple sessions
    let existing = localStorage.getItem('deviceId') || uuidv4();
    if (!existing.startsWith(role)) {
      existing = `${role}_${existing}`;
      localStorage.setItem('deviceId', existing);
    }
    const instance = `${existing}_${uuidv4().slice(0, 6)}`; // unique per open tab
    setDeviceId(existing);
    setSessionId(instance);
    setSharing(true);

    // fetch profile if exists
    if (user?.uid) {
      const profile = await getUserById(user.uid);
      if (profile) {
        setUserProfile(profile);
        setUserName(profile.name || '');
      } else {
        setUserProfile(null);
      }
    }

    console.log('Role selected', role, 'session', instance);
  };

  /* -----------------------------
     GEOLOCATION WATCH: whenever sharing true
     ----------------------------- */
  useEffect(() => {
    if (!sharing) {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not available in this browser');
      return;
    }

    const onPos = (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCurrentCoords(coords);
      // write to RTDB locations/{sessionId}
      if (sessionId && userRole !== 'viewer') {
        const safeId = sessionId.replace(/\./g, '_');
        rtdbSet(rtdbRef(database, `locations/${safeId}`), {
          sessionId: safeId,
          deviceId,
          uid: user?.uid || null,
          role: userRole,
          name: userName || 'Anonymous',
          lat: coords.lat,
          lng: coords.lng,
          isAvailable: isAvailable,
          timestamp: Date.now(),
        }).catch((e) => console.error('Failed save location', e));
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      onPos,
      (err) => console.error('geo error', err),
      { enableHighAccuracy: true }
    );

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [sharing, sessionId, userRole, deviceId, userName, isAvailable, user?.uid]);

  /* -----------------------------
     RTDB: subscribe to locations (all)
     ----------------------------- */
  useEffect(() => {
    const locRef = rtdbRef(database, 'locations');
    const unsub = onValue(locRef, (snap) => {
      const data = snap.val() || {};
      setAllLocations(data);
    });
    return () => unsub();
  }, []);

  /* -----------------------------
     VISIBILITY RULES: compute visible markers
     - Customer: sees cleaners only (available)
     - Cleaner: sees ONLY the customer who requested them (or their active job)
     ----------------------------- */
  const visibleMarkers = Object.entries(allLocations).filter(([id, loc]) => {
    if (!loc || !loc.lat || !loc.lng || !loc.role) return false;
    const isSelf = loc.sessionId === sessionId || loc.uid === user?.uid;
    if (isSelf) return true;

    if (userRole === 'customer') {
      if (loc.role !== 'cleaner') return false;
      // if customer has an active request, show only that cleaner
      if (currentCustomerRequest && currentCustomerRequest.cleanerUid) {
        return loc.uid === currentCustomerRequest.cleanerUid || loc.sessionId === currentCustomerRequest.cleanerUid;
      }
      // otherwise show only available cleaners
      return loc.isAvailable !== false;
    }

    if (userRole === 'cleaner') {
      // Cleaner should only see the customer who requested them, or the customer in activeJob
      const customerUid = incomingRequest?.from || activeJob?.customerUid || null;
      if (!customerUid) return false;
      return loc.uid === customerUid || loc.sessionId === customerUid;
    }

    // viewer sees none
    return userRole === 'viewer';
  });

  /* -----------------------------
     REQUEST: Customer sends a request to cleaner
     - enforce: customer must have profile (name)
     ----------------------------- */
  const requestCleaner = useCallback(async (cleanerUidOrSession) => {
    if (!user?.uid) return alert('Not signed in');
    if (userRole !== 'customer') return alert('Only customers can request cleaners');

    // ensure profile exists (customer must have a name in Firestore profile)
    const profile = await getUserById(user.uid);
    if (!profile || !profile.name) {
      setShowProfileModal(true);
      return alert('Please create your profile (name) before requesting a cleaner.');
    }
    
    if (!profile || !profile.name) {
      setShowDashboardModal(true);
      return alert('Please create your Admin profile (name) before proceeding to Dashboard.');
    }

    // write RTDB request: path requests/{cleanerUidOrSession}
    try {
      const reqPath = `requests/${cleanerUidOrSession}`;
      await rtdbSet(rtdbRef(database, reqPath), {
        from: user.uid,
        fromName: profile.name,
        to: cleanerUidOrSession,
        customerName: profile.name,
        status: 'pending',
        timestamp: Date.now(),
      });

      // save the key so we can later update that exact RTDB path
      setCurrentRequestKey(cleanerUidOrSession);
      setCurrentCustomerRequest({ cleanerUid: cleanerUidOrSession, cleanerName: null, status: 'pending' });
      setCustomerNotice({ title: 'Request sent', body: 'Waiting for cleaner response', type: 'info' });
    } catch (err) {
      console.error('requestCleaner error', err);
      alert('Failed to send request');
    }
  }, [user, userRole]);

  /* -----------------------------
     Listen for customer's request responses (customer side)
     - open payment modal when request status === 'waiting_for_payment'
     ----------------------------- */
  useEffect(() => {
    if (!user?.uid || userRole !== 'customer') return;
    const reqRef = rtdbRef(database, 'requests');
    const unsub = onValue(reqRef, (snap) => {
      const data = snap.val() || {};
      // find requests where from === user.uid
      const my = Object.entries(data).filter(([, req]) => req.from === user.uid);
      if (!my.length) {
        setCurrentCustomerRequest(null);
        return;
      }
      const [, latest] = my[my.length - 1];

      // prefer cleanerName if present
      const cleanerIdOrSession = latest.to || latest.cleanerUid;
      const cleanerNameFromRTDB = latest.cleanerName || latest.toName || null;

      setCurrentCustomerRequest({ cleanerUid: cleanerIdOrSession, cleanerName: cleanerNameFromRTDB, status: latest.status });

      // show notices & special transitions
      if (latest.status === 'accepted') {
        setCustomerNotice({ title: 'Cleaner Accepted', body: `Cleaner ${latest.cleanerName || latest.toName || ''} is on the way`, type: 'success' });
        setCurrentRequestKey(latest.to || latest.cleanerUid || currentRequestKey);
      }
      if (latest.status === 'rejected') {
        setCustomerNotice({ title: 'Cleaner Rejected', body: 'Try another cleaner', type: 'error' });
        setCurrentCustomerRequest(null);
      }

      if (latest.status === "waiting_for_payment") {
        // cleaner pressed "Finish Job" -> open payment modal
        setCustomerNotice({ title: 'Job Finished', body: 'Please complete payment', type: 'info' });

        // The RTDB entry may have bookingId if cleaner included it - check
        if (latest.bookingId) {
          setPaymentBookingId(latest.bookingId);
        }
        // show payment modal (receipt will be shown inside)
        setShowPaymentModal(true);
      }

      if (latest.status === "paid" || latest.status === "closed") {
        setCustomerNotice({ title: 'Payment received', body: 'Thank you — job complete', type: 'success' });
        setCurrentCustomerRequest(null);
        setIncomingRequest(null);
        // clear local booking key as job is done
        setCurrentRequestKey(null);
        setCurrentRequestId(null);
        return;
      }
    });

    return () => unsub();
  }, [user?.uid, userRole]);

  /* -----------------------------
     Cleaner: listen for incoming request on requests/{cleanerUid}
     ----------------------------- */
  useEffect(() => {
    if (!user?.uid || userRole !== 'cleaner') return;
    const reqPath = rtdbRef(database, `requests/${user.uid}`);
    const unsub = onValue(reqPath, (snap) => {
      const data = snap.val();
      if (!data) {
        setIncomingRequest(null);
        return;
      }
      // handle lifecycle transitions
      if (data.status === 'pending') {
        setIncomingRequest(data);
      } else if (data.status === 'accepted') {
        // keep `accepted` briefly or rely on local activeJob state
        setIncomingRequest(null);
      } else if (data.status === 'cancelled' || data.status === 'rejected') {
        // if cancelled while we had an active job, clear it
        if (activeJob?.customerUid === data.from) {
          setActiveJob(null);
          setIsAvailable(true);
        }
        setIncomingRequest(null);
      } else if (data.status === "paid" || data.status === "closed") {
        // payment completed by customer -> cleanup job, bring cleaner online
        setActiveJob(null);
        setIncomingRequest(null);
        setIsTrackingCustomer(false);
        setIsAvailable(true);
        setCustomerNotice({ title: 'Job paid', body: 'You are back online', type: 'success' });
      } else if (data.status === 'completed' || data.status === 'waiting_for_payment') {
        // customer hasn't paid yet but cleaner marked finished
        // typically we keep incomingRequest null but ensure activeJob exists
      }
    });

    return () => unsub();
  }, [user?.uid, userRole, activeJob]);

  /* -----------------------------
     Cleaner: Accept Request
     ----------------------------- */
  const acceptRequest = async () => {
    if (!incomingRequest || !user?.uid) return alert('No incoming request');
    setIsProcessing(true);
    try {
      // 1) mark RTDB request accepted (so customer sees fast)
      const reqRefPath = `requests/${user.uid}`;

      // prefer customerName from incomingRequest
      const customerName = incomingRequest.customerName || incomingRequest.fromName || null;

      const acceptedPayload = {
        ...incomingRequest,
        status: 'accepted',
        acceptedAt: Date.now(),
        cleanerUid: user.uid,
        cleanerName: userName || '',
        customerName: customerName || '',
      };
      await rtdbSet(rtdbRef(database, reqRefPath), acceptedPayload);

      // set current request key so further updates target this path
      setCurrentRequestKey(user.uid);

      // 2) mark cleaner unavailable in locations
      if (sessionId) {
        await rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
          sessionId,
          deviceId,
          uid: user.uid,
          role: userRole,
          name: userName || 'Cleaner',
          lat: currentCoords?.lat ?? null,
          lng: currentCoords?.lng ?? null,
          isAvailable: false,
          timestamp: Date.now(),
        });
      }
      setIsAvailable(false);

      // 3) create booking in Firestore (we use your bookingService)
      const customerId = incomingRequest.from;
      const bookingResult = await createBooking({
        customerId,
        cleanerId: user.uid,
        serviceType: 'standard',
        location: { lat: currentCoords?.lat ?? null, lng: currentCoords?.lng ?? null },
        price: 0,
      });

      // createBooking may return id or docRef
      const bookingId = (bookingResult && bookingResult.id) ? bookingResult.id : bookingResult;

      // 4) update Firestore booking with names (best-effort)
      try {
        if (bookingId) {
          await updateDoc(doc(db, 'bookings', bookingId), {
            cleanerName: userName || '',
            customerName: incomingRequest.customerName || incomingRequest.fromName || '',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn('Could not append names to booking', e);
      }

      // 5) update RTDB request with bookingId
      await rtdbSet(rtdbRef(database, reqRefPath), {
        ...acceptedPayload,
        bookingId,
      });

      // 6) update local active job
      setActiveJob({
        cleanerUid: user.uid,
        cleanerName: userName || '',
        customerUid: customerId,
        customerName: incomingRequest.customerName || incomingRequest.fromName || '',
        bookingId,
        status: 'accepted',
        startedAt: Date.now(),
      });

      setCurrentRequestId(bookingId);
      setIncomingRequest(null);
      setIsProcessing(false);
      setCustomerNotice({ title: 'Accepted', body: 'You accepted the job. Tracking enabled.', type: 'success' });

      // center to customer if their location available
      const customerEntry = Object.entries(allLocations).find(([, loc]) => loc.uid === customerId);
      if (customerEntry) {
        const [, loc] = customerEntry;
        setCustomerCoords({ lat: loc.lat, lng: loc.lng });
        setTargetCoords({ lat: loc.lat, lng: loc.lng });
        setRecenterTrigger((t) => t + 1);
      }
    } catch (err) {
      console.error('acceptRequest failed', err);
      setIsProcessing(false);
      alert('Failed to accept request (see console)');
    }
  };

  /* -----------------------------
     Cleaner: Track Customer on Map
     ----------------------------- */
  const handleTrackCustomer = () => {
    if (!activeJob?.customerUid) return alert('No active job customer set');
    // find in allLocations
    const found = Object.entries(allLocations).find(([, loc]) => loc.uid === activeJob.customerUid);
    if (found) {
      const [, loc] = found;
      setTargetCoords({ lat: loc.lat, lng: loc.lng });
      setRecenterTrigger((t) => t + 1);
    } else {
      alert('Customer location not found');
    }
  };

  /* -----------------------------
     Cleaner: Finish Job
     ----------------------------- */
  const finishJob = async () => {
    if (!activeJob?.bookingId || !activeJob?.customerUid) {
      return alert('No active job to finish');
    }
    setIsProcessing(true);
    try {
      // 1) update Firestore booking -> completed
      await updateBookingStatus(activeJob.bookingId, 'completed');

      // 2) update RTDB request so the customer gets notified (path = requests/{cleanerUid})
      if (activeJob?.cleanerUid) {
        const reqPath = `requests/${activeJob.cleanerUid}`;
        await rtdbSet(rtdbRef(database, reqPath), {
          from: activeJob.customerUid,
          fromName: activeJob.customerName || '',
          to: activeJob.cleanerUid,
          cleanerName: activeJob.cleanerName || '',
          customerName: activeJob.customerName || '',
          status: "waiting_for_payment",
          bookingId: activeJob.bookingId,
          timestamp: Date.now(),
        });
      }

      // 3) set activeJob local state -> still kept until payment done
      setActiveJob((prev) => prev ? { ...prev, status: 'completed' } : prev);
      setIsProcessing(false);
      setCustomerNotice({ title: 'Job finished', body: 'Waiting for customer to pay', type: 'info' });
    } catch (err) {
      console.error('finishJob error', err);
      setIsProcessing(false);
      alert('Failed to finish job');
    }
  };

  /* -----------------------------
     Cleaner: Cancel Active Job
     ----------------------------- */
  const cancelActiveJob = async (reason = 'cancelled_by_cleaner') => {
    if (!activeJob) return alert('No active job');
    setIsProcessing(true);
    try {
      // update RTDB request to cancelled
      if (activeJob.cleanerUid) {
        await rtdbSet(rtdbRef(database, `requests/${activeJob.cleanerUid}`), {
          from: activeJob.customerUid,
          fromName: activeJob.customerName || '',
          status: 'cancelled',
          reason,
          timestamp: Date.now(),
        });
      }
      // update Firestore booking
      if (activeJob.bookingId) {
        await updateBookingStatus(activeJob.bookingId, 'cancelled');
      }

      // mark cleaner available
      if (sessionId) {
        await rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
          sessionId,
          deviceId,
          uid: user.uid,
          role: userRole,
          name: userName || 'Cleaner',
          lat: currentCoords?.lat ?? null,
          lng: currentCoords?.lng ?? null,
          isAvailable: true,
          timestamp: Date.now(),
        });
      }
      setIsAvailable(true);
      setActiveJob(null);
      setIsProcessing(false);
    } catch (err) {
      console.error('cancelActiveJob', err);
      setIsProcessing(false);
      alert('Failed to cancel job');
    }
  };

  /* -----------------------------
     Customer: Cancel Request
     ----------------------------- */
  const cancelCustomerRequest = async () => {
    if (!currentCustomerRequest?.cleanerUid) return alert('No active request');
    try {
      const cleanerUid = currentCustomerRequest.cleanerUid;
      await rtdbSet(rtdbRef(database, `requests/${cleanerUid}`), {
        from: user.uid,
        fromName: userName || '',
        status: 'cancelled',
        timestamp: Date.now(),
      });
      setCurrentCustomerRequest(null);
      setCurrentRequestKey(null);
      setCustomerNotice({ title: 'Cancelled', body: 'Your request was cancelled', type: 'error' });
    } catch (err) {
      console.error('cancelCustomerRequest', err);
      alert('Failed to cancel request');
    }
  };

  /* -----------------------------
     Receipt printing helper
     ----------------------------- */
  const printReceipt = (receipt, bookingId, cleanerName, customerName) => {
    if (!receipt) return alert('No receipt to print');
    const html = `
      <html>
      <head>
        <title>Receipt ${receipt.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          .receipt { max-width: 480px; margin: 0 auto; border: 1px solid #ddd; padding: 18px; border-radius: 6px; }
          .brand { text-align: center; margin-bottom: 12px; }
          h1 { margin: 0; font-size: 20px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 12px; }
          .line { display:flex; justify-content:space-between; margin:8px 0; }
          .total { font-weight:700; font-size:18px; }
          .paid { display:inline-block; background:#16a34a;color:#fff;padding:4px 8px;border-radius:4px;font-weight:700;margin-top:10px;}
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="brand">
            <h1>Cleaning Service Receipt</h1>
            <div class="meta">Booking: ${bookingId || '—'} | Receipt: ${receipt.id}</div>
          </div>
          <div><strong>Cleaner:</strong> ${cleanerName || '—'}</div>
          <div><strong>Customer:</strong> ${customerName || '—'}</div>
          <hr />
          <div class="line"><div>Service</div><div>Amount</div></div>
          <div class="line"><div>Cleaning (demo)</div><div>${receipt.amount}</div></div>
          <hr />
          <div class="line total"><div>Total</div><div>${receipt.amount}</div></div>
          <div style="text-align:center;">
            <span class="paid">PAID</span>
            <div style="margin-top:10px;font-size:12px;color:#666">${new Date(receipt.date).toLocaleString()}</div>
          </div>
        </div>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (!win) return alert('Popup blocked. Allow popups to print receipts.');
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.print();
    }, 300);
  };

  /* -----------------------------
     Customer: Payment (demo)
     ----------------------------- */
  const submitPayment = async () => {
    if (!paymentAmount || isProcessing) return;

    setIsProcessing(true);
    try {
      // 1. Mark booking as PAID in Firestore
      const bookingId = activeJob?.bookingId || paymentBookingId;
      if (bookingId) {
        await updateDoc(doc(db, "bookings", bookingId), {
          status: "paid",
          paidAmount: paymentAmount,
          paidAt: serverTimestamp(),
        });
      }

      // 2. Update RTDB request for instant cleaner feedback
      const cleanerPath = currentRequestKey || currentCustomerRequest?.cleanerUid || activeJob?.cleanerUid;
      const customerId = user.uid;
      const customerNameToUse = userName || (userProfile && userProfile.name) || 'Customer';
      const cleanerNameToUse = activeJob?.cleanerName || currentCustomerRequest?.cleanerName || '';

      if (cleanerPath) {
        await rtdbSet(rtdbRef(database, `requests/${cleanerPath}`), {
          from: customerId,
          fromName: customerNameToUse,
          to: cleanerPath,
          cleanerName: cleanerNameToUse,
          customerName: customerNameToUse,
          status: "paid",
          amount: paymentAmount,
          bookingId: bookingId,
          timestamp: Date.now(),
        });
      }

      // 3. Fake receipt for demo UI
      const receipt = {
        id: Math.random().toString(36).substring(2, 10),
        amount: paymentAmount,
        date: new Date().toISOString(),
      };
      setPaymentReceipt(receipt);

      // 4. Write receipts + payments to Firestore for records
      try {
        const receiptDoc = await addDoc(collection(db, 'receipts'), {
          receiptId: receipt.id,
          bookingId: bookingId || null,
          cleanerId: activeJob?.cleanerUid || null,
          cleanerName: cleanerNameToUse,
          customerId,
          customerName: customerNameToUse,
          amount: paymentAmount,
          createdAt: serverTimestamp(),
        });

        // also create a simple payments record
        await addDoc(collection(db, 'payments'), {
          receiptRef: receiptDoc.id,
          bookingId: bookingId || null,
          amount: paymentAmount,
          payerId: customerId,
          payeeId: activeJob?.cleanerUid || null,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn('Failed to write receipt/payment to Firestore', e);
      }

      // 5. Resolve cleanerId for rating context (store even if null)
      let cleanerId = activeJob?.cleanerUid || currentCustomerRequest?.cleanerUid || currentRequestKey;
      if (!cleanerId && bookingId) {
        try {
          const bDoc = await getDoc(doc(db, 'bookings', bookingId));
          if (bDoc.exists()) {
            const d = bDoc.data();
            cleanerId = d?.cleanerId || d?.cleanerUid || cleanerId;
          }
        } catch (e) {
          console.warn('Failed to read booking to get cleanerId', e);
        }
      }

      // 6. Set rating context using resolved values
      setRatingBookingContext({
        bookingId: bookingId,
        cleanerId: cleanerId || null,
      });

      // show payment modal (receipt visible)
      setShowPaymentModal(true);

      // clear customer-side request UI (so cancel button disappears)
      setCurrentCustomerRequest(null);
      setCurrentRequestId(bookingId || null);
      setCurrentRequestKey(null);

    } catch (err) {
      console.error("❌ submitPayment() error:", err);
      alert("Payment failed. Check console.");
    }
    finally {
      setIsProcessing(false);
    }
  };

  /* -----------------------------
     Rating: 1-5 stars
     ----------------------------- */
  const submitRating = async (value = ratingValue, comment = ratingComment) => {
    if (isProcessing || !value) return;

    const bookingId =
      ratingBookingContext?.bookingId ||
      activeJob?.bookingId ||
      paymentBookingId;

    let cleanerId =
      ratingBookingContext?.cleanerId ||
      activeJob?.cleanerUid ||
      currentRequestKey;

    if (!cleanerId && bookingId) {
      try {
        const bDoc = await getDoc(doc(db, 'bookings', bookingId));
        if (bDoc.exists()) {
          const d = bDoc.data();
          cleanerId = d?.cleanerId || d?.cleanerUid || cleanerId;
        }
      } catch (e) {
        console.warn('Failed to load booking to resolve cleanerId', e);
      }
    }

    if (!bookingId || !cleanerId) {
      console.error("Rating aborted: missing bookingId or cleanerId", { bookingId, cleanerId });
      alert("Cannot submit rating: missing booking or cleaner information.");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Save rating
      await addDoc(collection(db, "ratings"), {
        bookingId,
        cleanerUid: cleanerId,
        customerUid: user?.uid,
        rating: value,
        comment: comment || "",
        createdAt: serverTimestamp(),
      });

      // 2. Mark booking as closed
      await updateDoc(doc(db, "bookings", bookingId), {
        status: "closed",
        closedAt: serverTimestamp(),
      });

      // 3. Delete request path (both possible keys)
      try {
        await rtdbRemove(rtdbRef(database, `requests/${cleanerId}`));
      } catch (e) { /* ignore */ }
      try {
        if (currentRequestKey) await rtdbRemove(rtdbRef(database, `requests/${currentRequestKey}`));
      } catch (e) { /* ignore */ }

      // 4. Compute aggregate rating (avg + count) from ratings collection for this cleaner
      try {
        const ratingsQ = query(collection(db, 'ratings'), where('cleanerUid', '==', cleanerId));
        const snap = await getDocs(ratingsQ);
        let sum = 0;
        let cnt = 0;
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d && typeof d.rating === 'number') {
            sum += d.rating;
            cnt += 1;
          } else if (d && !isNaN(Number(d.rating))) {
            sum += Number(d.rating);
            cnt += 1;
          }
        });
        const avg = cnt ? (sum / cnt) : 0;

        // update cleaner user doc with aggregated stats and increment completedJobs (Option A)
        try {
          const userRef = doc(db, 'users', cleanerId);
          const userDoc = await getDoc(userRef);
          const prevCompleted = userDoc.exists() ? (userDoc.data().completedJobs || 0) : 0;
          const newCompleted = prevCompleted + 1;

          await updateDoc(userRef, {
            averageRating: avg,
            ratingCount: cnt,
            completedJobs: newCompleted,
            lastRatedAt: serverTimestamp()
          });
        } catch (uErr) {
          console.warn('Failed to update cleaner user doc with aggregates', uErr);
        }
      } catch (aggErr) {
        console.warn('Failed to compute rating aggregate', aggErr);
      }

      // 5. Reset cleaner availability if this client is the cleaner
      if (sessionId && userRole === "cleaner") {
        await rtdbSet(rtdbRef(database, `locations/${sessionId}`), {
          sessionId,
          deviceId,
          uid: user?.uid,
          role: userRole,
          name: userName || "Cleaner",
          lat: currentCoords?.lat ?? null,
          lng: currentCoords?.lng ?? null,
          isAvailable: true,
          timestamp: Date.now(),
        });
      }

      // 6. Reset UI state
      setActiveJob(null);
      setCurrentRequestId(null);
      setCurrentRequestKey(null);
      setShowRatingModal(false);
      setRatingBookingContext(null);
      setCurrentCustomerRequest(null);
      setIncomingRequest(null);
      setPaymentReceipt(null);
      setRatingValue(0);
      setRatingComment('');
      setIsTrackingCustomer(false);
      setIsAvailable(true);

      setCustomerNotice({ title: "Done", body: "Rating submitted and job closed", type: "success" });
    } catch (err) {
      console.error("❌ submitRating() error:", err);
      alert("Failed to submit rating. Check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  /* -----------------------------
     View Cleaner Profile helper (loads profile + aggregates)
     ----------------------------- */
 const viewCleanerProfile = async (cleanerUid) => {
  if (!cleanerUid) return alert('Cleaner profile not available');

  setCleanerProfile(null); // show loading
  setShowCleanerProfilePanel(true); // open modal immediately

  try {
    const prof = await getUserById(cleanerUid);
    // compute ratings
    let avg = 0, count = 0;
    try {
      const ratingsQ = query(collection(db, 'ratings'), where('cleanerUid', '==', cleanerUid));
      const snap = await getDocs(ratingsQ);
      let sum = 0, cnt = 0;
      snap.forEach(s => {
        const d = s.data();
        if (d && typeof d.rating === 'number') { sum += d.rating; cnt += 1; }
        else if (d && !isNaN(Number(d.rating))) { sum += Number(d.rating); cnt += 1; }
      });
      avg = cnt ? (sum / cnt) : 0;
      count = cnt;
    } catch (e) { console.warn(e); }

    setCleanerProfile({
      uid: cleanerUid,
      name: prof?.name || 'Anonymous cleaner',
      avgRating: avg,
      ratingCount: count,
      completedJobs: prof?.completedJobs || 0,
      bio: prof?.bio || ''
    });

  } catch (e) {
    console.error(e);
    setCleanerProfile({
      uid: cleanerUid,
      name: 'Cleaner',
      avgRating: 0,
      ratingCount: 0,
      completedJobs: 0,
      bio: ''
    });
  }
};


  /* -----------------------------
     Render popup JSX
     ----------------------------- */
  function renderPopupContentJSX(loc) {
    const isSelf = (loc.uid === user?.uid || loc.sessionId === sessionId);
    if (isSelf) {
      return (
        <div>
          <strong>You (this device)</strong>
        </div>
      );
    }

    if (userRole === 'customer' && loc.role === 'cleaner') {
      const hasActiveRequest =
        currentCustomerRequest &&
        (currentCustomerRequest.cleanerUid === loc.uid ||
         currentCustomerRequest.cleanerUid === loc.sessionId);

      return (
        <div>
          <strong>Cleaner</strong>
          <div>{loc.name || 'Cleaner'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              className="btn btn-outline"
              onClick={() => viewCleanerProfile(loc.uid || loc.sessionId)}
            >
              View Cleaner Profile
            </button>

            <button
              className="btn btn-primary"
              onClick={() => requestCleaner(loc.uid || loc.sessionId)}
              disabled={hasActiveRequest}
            >
              {hasActiveRequest ? 'Request Sent' : 'Request'}
            </button>
          </div>
        </div>
      );
    }

    if (userRole === 'cleaner' && loc.role === 'customer') {
      return (
        <div>
          <strong>Customer</strong>
          <div>{loc.name || 'Customer'}</div>
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-success"
              onClick={() => {
                setIncomingRequest(null);
                alert('Tap Accept in the incoming request panel.');
              }}
            >
              View Request
            </button>
          </div>
        </div>
      );
    }

    return <div><strong>{loc.role}</strong></div>;
  }

  /* -----------------------------
     UI helpers
     ----------------------------- */
  const toggleSharing = async () => {
    if (sharing) {
      if (sessionId) {
        await rtdbRemove(rtdbRef(database, `locations/${sessionId}`)).catch(() => {});
      }
      setSharing(false);
      setIsAvailable(false);
    } else {
      setSharing(true);
      setIsAvailable(true);
    }
  };

  const openProfileModal = () => setShowProfileModal(true);

  const renderStars = (avg) => {
    const n = Math.round(avg);
    const filled = '★'.repeat(n);
    const empty = '☆'.repeat(5 - n);
    return (
      <span style={{ color: '#f59e0b', fontSize: 16 }}>
        {filled}{empty}
      </span>
    );
  };

  /* -----------------------------
     Realtime messages listener (instant delivery)
     - listens to same conversation subcollection used by ChatBox
     ----------------------------- */
  useEffect(() => {
    if (!user?.uid || !chatWith) return;

    const conversationId = generateConversationId(user.uid, chatWith);
    if (!conversationId) return;

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latest = snapshot.docs[0].data();

        // Skip notifications when the latest message is from current user
        if (latest.senderId !== user.uid) {
          setIncomingMessage({
            text: latest.text,
            senderId: latest.senderId,
            conversationId,
          });

          setUnreadMessages((prev) => ({
            ...prev,
            [latest.senderId]: true,
          }));
        }
      }
    });

    return () => unsub();
  }, [user?.uid, chatWith]);

  /* -----------------------------
     CHAT PANEL LAYOUT LOGIC (NEW)
     ----------------------------- */
  const chatPanelWidth = chatWith ? 320 : 0;

  const mainGridStyle = {
    display: 'grid',
    gridTemplateColumns: `380px 1fr ${chatPanelWidth}px`,
    gap: '1rem',
    width: '95%',
    height: '750px',
    margin: '1rem auto',
    transition: 'grid-template-columns 0.30s ease',
  };

  /* -----------------------------
     Main render
     ----------------------------- */
  return (
    <div className="App m-0 bg-black-50">

      {/* MAIN LAYOUT GRID */}
      <div style={mainGridStyle}>

        {/* LEFT PANEL */}
        <div className="max-height: 97vh space-y-4 relative">

          {/* SESSION BOX */}
          <div className="p-4 bg-white rounded shadow">
            <h2 className="text-lg font-semibold">Session</h2>
            {!userRole && showRoleModal && (
              <div className="mt-4">
                <p className="mb-2">Who are you?</p>
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-gray-200 rounded"
                          onClick={() => handleRoleSelect('viewer')}>
                    Viewer
                  </button>
                  <button className="px-3 py-2 bg-green-500 text-white rounded"
                          onClick={() => handleRoleSelect('cleaner')}>
                    Cleaner
                  </button>
                  <button className="px-3 py-2 bg-blue-500 text-white rounded"
                          onClick={() => handleRoleSelect('customer')}>
                    Customer
                  </button>
                </div>  
              </div>
            )}

            <div className="mt-4">
              <button
                className="px-3 py-2 bg-indigo-600 text-white rounded"
                onClick={toggleSharing}
              >
                {sharing ? 'Stop Sharing' : 'Start Sharing'}
              </button>

              <button
                className="ml-2 px-3 py-2 bg-white border rounded"
                onClick={openProfileModal}
              >
                Profile
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <div>Role: <strong>{userRole || '—'}</strong></div>
              <div>
                Availability:{' '}
                <strong>
                  {userRole === 'cleaner'
                    ? (activeJob
                        ? 'On Job'
                        : (isAvailable ? 'Online' : 'Offline'))
                    : (userRole === 'customer'
                        ? (sharing ? 'Online' : 'Offline')
                        : '-')}
                </strong>
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className="p-4 bg-white rounded shadow space-y-2">
            <h3 className="font-semibold">Notifications</h3>

            {customerNotice && (
              <div className={`p-3 rounded ${
                customerNotice.type === 'error' ? 'bg-red-50'
                : customerNotice.type === 'success' ? 'bg-green-50'
                : 'bg-blue-50'
              }`}>
                <strong>{customerNotice.title}</strong>
                <div>{customerNotice.body}</div>
                <div className="mt-2">
                  <button
                    onClick={() => setCustomerNotice(null)}
                    className="px-2 py-1 bg-gray-200 rounded"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {incomingMessage && (
              <div className="p-2 bg-yellow-50 rounded">
                <div><strong>Message:</strong> {incomingMessage.text}</div>
                <div className="mt-2">
                  <button
                    className="px-2 py-1 bg-gray-200 rounded"
                    onClick={() => {
                      setChatWith(incomingMessage.senderId);
                      setIncomingMessage(null);
                      // mark as read in unreadMessages handled by ChatBox close/interaction
                    }}
                  >
                    Open Chat
                  </button>
                </div>
              </div>
            )}

            {/* ACTIVE JOB PANEL */}
            {activeJob ? (
              <div className="p-2 border rounded">
                <div className="font-semibold">Job active</div>
                <div>Customer: {activeJob.customerName || activeJob.customerUid}</div>
                <div>Booking: {activeJob.bookingId}</div>
                <div className="mt-2 flex gap-2">

                  <button
                    className="px-2 py-1 bg-blue-500 text-white rounded"
                    onClick={handleTrackCustomer}
                    disabled={isProcessing}
                  >
                    Track Customer
                  </button>

                  <button
                    className="px-2 py-1 bg-green-500 text-white rounded"
                    onClick={finishJob}
                    disabled={isProcessing}
                  >
                    Finish Job
                  </button>

                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    onClick={() => cancelActiveJob('cancelled_by_cleaner')}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>

                  {/* CHAT */}
                  <button
                    className="px-2 py-1 bg-indigo-600 text-white rounded"
                    onClick={() => {
                      const target =
                        userRole === 'cleaner'
                          ? activeJob.customerUid
                          : activeJob.cleanerUid;
                      if (!target) return alert('Chat target missing');
                      setChatWith(target);
                    }}
                  >
                    Chat
                  </button>
                </div>
              </div>
            ) : incomingRequest ? (
              <div className="p-2 border rounded">
                <div className="font-semibold">Incoming Request</div>
                <div>From: {incomingRequest.customerName || incomingRequest.fromName || incomingRequest.from}</div>
                <div className="mt-2 flex gap-2">

                  <button
                    className="px-2 py-1 bg-blue-500 text-white rounded"
                    onClick={handleTrackCustomer}
                  >
                    Track
                  </button>

                  <button
                    className="px-2 py-1 bg-green-500 text-white rounded"
                    onClick={acceptRequest}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Accepting...' : 'Accept'}
                  </button>

                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    disabled={isProcessing}
                    onClick={async () => {
                      await rtdbSet(
                        rtdbRef(database, `requests/${user.uid}`),
                        { ...incomingRequest, status: 'rejected' }
                      );
                      setIncomingRequest(null);
                    }}
                  >
                    Reject
                  </button>

                </div>
              </div>
            ) : null}

            {/* CUSTOMER REQUEST PANEL */}
            {currentCustomerRequest &&
             userRole === 'customer' &&
             currentCustomerRequest.status !== 'paid' && (
              <div className="p-2 border rounded">
                <div>
                  <strong>Your request is:</strong>{' '}
                  {currentCustomerRequest.status}
                </div>

                <div className="mt-2 flex gap-2">

                  <button
                    className="px-2 py-1 bg-red-500 text-white rounded"
                    onClick={cancelCustomerRequest}
                  >
                    Cancel Request
                  </button>

                  {(currentCustomerRequest.status === 'accepted' ||
                    activeJob) && (
                    <button
                      className="px-2 py-1 bg-indigo-600 text-white rounded"
                      onClick={() => {
                        const target =
                          currentCustomerRequest.cleanerUid ||
                          activeJob?.cleanerUid;
                        if (!target)
                          return alert('Cleaner not ready for chat.');
                        setChatWith(target);
                      }}
                    >
                      Chat
                    </button>
                  )}

                </div>

                              {/* CLEANER PROFILE MODAL */}
              {showCleanerProfilePanel && (
                  <div className="bg-blue-100 p-4 mt-3 rounded shadow w-full max-w-md">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold">
                        {cleanerProfile ? cleanerProfile.name : 'Loading...'}
                      </h3>
                      <button
                        onClick={() => setShowCleanerProfilePanel(false)}
                        className="px-2 py-1 text-gray-600 hover:text-gray-800"
                      >
                        Close
                      </button>
                    </div>

                    {/* Role */}
                    <p className="text-sm text-gray-500 mb-2">Role: Cleaner</p>

                    {/* Ratings */}
                    {cleanerProfile ? (
                      <div className="flex items-center mb-2">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const starValue = i + 1;
                          if (cleanerProfile.avgRating >= starValue) {
                            return <span key={i} className="text-yellow-400 text-xl">★</span>;
                          } else if (cleanerProfile.avgRating >= starValue - 0.5) {
                            return <span key={i} className="text-yellow-400 text-xl">⯨</span>; // half star fallback
                          } else {
                            return <span key={i} className="text-gray-300 text-xl">★</span>;
                          }
                        })}
                        <span className="ml-2 text-gray-700 font-medium">
                          {cleanerProfile.avgRating.toFixed(1)} ({cleanerProfile.ratingCount})
                        </span>
                      </div>
                    ) : (
                      <p>Loading ratings...</p>
                    )}

                    {/* Completed Jobs */}
                    {cleanerProfile && (
                      <p className="text-sm text-gray-600">
                        Completed Jobs: {cleanerProfile.completedJobs}
                      </p>
                    )}

                    {/* Bio */}
                    {cleanerProfile?.bio && <p className="mt-2 text-gray-700">{cleanerProfile.bio}</p>}
                  </div>
                
              )}
              

              </div>
            )}
            
            
          </div>

        </div>

        {/* CENTER MAP */}
        <div className="bg-white rounded h-[100%] shadow p-2">
          <h2 className="text-lg font-semibold mb-2">Map</h2>

          <div style={{ height: '80vh' }} className="rounded overflow-hidden">
            <MapContainer
              center={[0, 0]}
              zoom={2}
              className="h-full w-full"
            >
              {(targetCoords || currentCoords) && (
                <RecenterMap
                  coords={targetCoords || currentCoords}
                  trigger={recenterTrigger}
                />
              )}

              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
              />

              {currentCoords && customerCoords && activeJob && (
                <ManualRoute from={currentCoords} to={customerCoords} />
              )}

              {currentCoords && targetCoords && (
                <ManualRoute from={currentCoords} to={targetCoords} />
              )}

              {/* SELF MARKER */}
              {currentCoords && (
                <Marker
                  position={[currentCoords.lat, currentCoords.lng]}
                  icon={userMarkerIcon}
                >
                  <Popup>You (this device)</Popup>
                </Marker>
              )}

              {/* HARDCODED CLEANERS */}
              {hardcodedCleaners.map((c) => (
                <Marker
                  key={c.id}
                  position={[c.lat, c.lng]}
                  icon={createRoleIcon(
                    'https://img.icons8.com/ios-filled/50/000000/broom.png',
                    'cleaner'
                  )}
                >
                  <Popup>
                    <div>
                      <strong>Demo Cleaner: {c.id}</strong>
                      <div className="mt-2">
                        <button
                          className="px-2 py-1 bg-blue-500 text-white rounded"
                          onClick={() => {
                            setTargetCoords({ lat: c.lat, lng: c.lng });
                            setRecenterTrigger((t) => t + 1);
                          }}
                        >
                          Track This Cleaner
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* VISIBLE MARKERS */}
              {visibleMarkers.map(([id, loc]) => (
                <Marker
                  key={id}
                  position={[loc.lat, loc.lng]}
                  icon={createRoleIcon(
                    loc.role === 'cleaner'
                      ? 'https://img.icons8.com/ios-filled/50/000000/broom.png'
                      : 'https://img.icons8.com/ios-filled/50/000000/user.png',
                    loc.role
                  )}
                >
                  <Popup>{renderPopupContentJSX(loc)}</Popup>
                </Marker>
              ))}

            </MapContainer>
          </div>
        </div>

        {/* RIGHT CHAT PANEL */}
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.25s ease'
        }}>
          {chatWith && user?.uid && (
            <div style={{
              position: 'absolute',
              inset: 0,
              transform: chatWith ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.30s ease',
            }}>
              <ChatBox
                conversationId={generateConversationId(user.uid, chatWith)}
                recipientId={chatWith}
                onClose={() => setChatWith(null)}
                userRole={userRole}
              />
            </div>
          )}
        </div>

      </div>

      {/* DASHBOARD MODAL */}
      {ShowDashboardModal && (
        <div className="fixed inset-0 bg-black/40 z-[10000]">
          <DashBoard
            user={user}
            role={userRole}
            onClose={() => setShowDashboardModal(false)}
          />
        </div>
      )}

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Profile</h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-2 py-1"
              >
                Close
              </button>
            </div>

            <ProfileForm
              user={user}
              role={userRole}
              onClose={() => setShowProfileModal(false)}
            />
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md relative">
            <h3 className="font-semibold">Payment</h3>
            <p className="text-sm text-gray-600">
              Enter the amount to pay the cleaner.
            </p>

            {!paymentReceipt && (
              <>
                <div className="mt-3">
                  <label className="block text-sm">Amount</label>
                  <input
                    type="text"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border p-2 rounded"
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="px-3 py-2 bg-green-600 text-white rounded"
                    onClick={submitPayment}
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Submit Payment'}
                  </button>

                  <button
                    className="px-3 py-2 bg-gray-200 rounded"
                    onClick={() => setShowPaymentModal(false)}
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {paymentReceipt && (
              <div className="mt-3 p-2 border rounded">
                <div><strong>Receipt ID:</strong> {paymentReceipt.id}</div>
                <div><strong>Amount:</strong> {paymentReceipt.amount}</div>

                <div className="mt-2 flex gap-2">

                  <button
                    className="px-3 py-2 bg-indigo-600 text-white rounded"
                    onClick={() => {
                      const cleanerName =
                        (ratingBookingContext &&
                        ratingBookingContext.cleanerId) ||
                        activeJob?.cleanerUid ||
                        currentCustomerRequest?.cleanerUid ||
                        'Cleaner';

                      const customerName = userName || 'Customer';

                      printReceipt(
                        paymentReceipt,
                        paymentBookingId || activeJob?.bookingId || currentRequestId,
                        cleanerName,
                        customerName
                      );
                    }}
                  >
                    Print Receipt
                  </button>

                  <button
                    className="px-3 py-2 bg-green-600 text-white rounded"
                    onClick={() => {
                      setShowPaymentModal(false);
                      setShowRatingModal(true);
                    }}
                  >
                    Continue to Rating
                  </button>

                  <button
                    className="px-3 py-2 bg-gray-200 rounded"
                    onClick={() => setShowPaymentModal(false)}
                  >
                    Close
                  </button>

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* RATING MODAL */}
      {showRatingModal && ratingBookingContext && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md">
            <h3 className="font-semibold">Rate your Cleaner</h3>
            <p className="text-sm text-gray-600">1 (worst) - 5 (best)</p>

            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  className="px-3 py-2 bg-yellow-300 rounded"
                  onClick={() => submitRating(s, '')}
                >
                  {s}★
                </button>
              ))}
            </div>

            <div className="mt-3">
              <button
                className="px-3 py-2 bg-gray-200 rounded"
                onClick={() => setShowRatingModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;

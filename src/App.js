// src/App.js
import './App.css';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ManualRoute from './ManualRoute';
import ProfileForm from './components/profileform';
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

// Firestore helpers & services (you uploaded these files)
import { createBooking, processPayment, completeBooking, updateBookingStatus } from './services/bookingService';
import { addRating as addRatingService } from './services/ratingService';
import { getUserById, createUserProfile, updateUser } from './services/userService';
import { addDoc, serverTimestamp, updateDoc, doc, collection, getDoc } from 'firebase/firestore';

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
  const [activeJob, setActiveJob] = useState(null); // { cleanerUid, customerUid, bookingId, status }
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

    // write RTDB request: path requests/{cleanerUidOrSession}
    try {
      const reqPath = `requests/${cleanerUidOrSession}`;
      await rtdbSet(rtdbRef(database, reqPath), {
        from: user.uid,
        to: cleanerUidOrSession,
        customerName: profile.name,
        status: 'pending',
        timestamp: Date.now(),
      });

      // save the key so we can later update that exact RTDB path
      setCurrentRequestKey(cleanerUidOrSession);
      setCurrentCustomerRequest({ cleanerUid: cleanerUidOrSession, status: 'pending' });
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
      setCurrentCustomerRequest({ cleanerUid: latest.to || latest.cleanerUid, status: latest.status });

      // show notices & special transitions
      if (latest.status === 'accepted') {
        setCustomerNotice({ title: 'Cleaner Accepted', body: 'Cleaner is on the way', type: 'success' });
        // ensure we keep mapping the current request key
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
        // show payment modal
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
     - marks RTDB request status accepted
     - writes booking document in Firestore (createBooking)
     - marks cleaner location isAvailable=false
     - updates local activeJob
     ----------------------------- */
  const acceptRequest = async () => {
    if (!incomingRequest || !user?.uid) return alert('No incoming request');
    setIsProcessing(true);
    try {
      // 1) mark RTDB request accepted (so customer sees fast)
      const reqRefPath = `requests/${user.uid}`;
      const acceptedPayload = {
        ...incomingRequest,
        status: 'accepted',
        acceptedAt: Date.now(),
        cleanerUid: user.uid,
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
      const bookingId = await createBooking({
        customerId,
        cleanerId: user.uid,
        serviceType: 'standard',
        location: { lat: currentCoords?.lat ?? null, lng: currentCoords?.lng ?? null },
        price: 0,
      });

      // 4) update RTDB request with bookingId
      await rtdbSet(rtdbRef(database, reqRefPath), {
        ...acceptedPayload,
        bookingId,
      });

      // 5) update local active job
      setActiveJob({
        cleanerUid: user.uid,
        customerUid: customerId,
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
     Cleaner: Finish Job (marks booking completed; client triggers payment flow on customer)
     - Updates Firestore booking status to 'completed'
     - Updates RTDB request status to 'waiting_for_payment' (so customer sees payment modal)
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
          to: activeJob.cleanerUid,
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
    // Give browser a moment to render then call print
    setTimeout(() => {
      win.print();
    }, 300);
  };

  /* -----------------------------
     Customer: Payment (demo)
     - Customer fills amount manually (you chose option 3)
     - After pay: mark booking paid (Firestore) + rtdb request.status = 'paid'
     - then open rating (and set ratingBookingContext with cleanerId)
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
      // currentRequestKey usually holds cleaner uid (requests/{cleanerUid})
      if (currentRequestKey && activeJob?.customerUid) {
        await rtdbSet(rtdbRef(database, `requests/${currentRequestKey}`), {
          from: activeJob.customerUid,
          status: "paid",
          amount: paymentAmount,
          bookingId: bookingId,
          timestamp: Date.now(),
        });
      } else if (currentCustomerRequest?.cleanerUid) {
        // fallback safe write
        await rtdbSet(rtdbRef(database, `requests/${currentCustomerRequest.cleanerUid}`), {
          from: user.uid,
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

      // 4. Resolve cleanerId for rating context
      let cleanerId = currentRequestKey || currentCustomerRequest?.cleanerUid || activeJob?.cleanerUid;
      // If still missing, try to read booking doc to find cleanerId
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

      // 5. Set rating context using resolved values (ensure cleanerId present)
      setRatingBookingContext({
        bookingId: bookingId,
        cleanerId: cleanerId || null,
      });

      // open rating modal only if we have booking id and cleaner id or at least booking id
      setShowPaymentModal(false);
      setShowRatingModal(true);

      // clear customer-side request so cancel button disappears
      setCurrentCustomerRequest(null);
      setCurrentRequestId(bookingId || null);
      setCurrentRequestKey(null);

      // Optionally offer print immediately (customer flow)
      // We'll not auto-print, but show receipt on UI with print button in Payment modal area
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
     - saves rating, marks booking closed, removes RTDB request and resets states
     ----------------------------- */
  const submitRating = async (value = ratingValue, comment = ratingComment) => {
    if (isProcessing || !value) return;

    // Extract booking ID and cleaner ID safely BEFORE anything else
    const bookingId =
      ratingBookingContext?.bookingId ||
      activeJob?.bookingId ||
      paymentBookingId;

    let cleanerId =
      ratingBookingContext?.cleanerId ||
      activeJob?.cleanerUid ||
      currentRequestKey;

    // If cleanerId is still missing, try to read it from booking doc
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
      console.error("Rating aborted: missing bookingId or cleanerId", { bookingId, cleanerId, ratingBookingContext, activeJob, currentRequestKey });
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

      // 4. Reset cleaner availability if this client is the cleaner
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

      // 5. Reset UI state
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
      const hasActiveRequest = currentCustomerRequest && (currentCustomerRequest.cleanerUid === loc.uid || currentCustomerRequest.cleanerUid === loc.sessionId);
      return (
        <div>
          <strong>Cleaner</strong>
          <div>{loc.name || 'Cleaner'}</div>
          <div style={{ marginTop: 8 }}>
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
      // cleaner views customer: allow "View Request" if one exists
      return (
        <div>
          <strong>Customer</strong>
          <div>{loc.name || 'Customer'}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-success" onClick={() => {
              setIncomingRequest(null);
              alert('Tap Accept in the incoming request panel to accept this customer (server-synced).');
            }}>
              View Request
            </button>
          </div>
        </div>
      );
    }

    return <div><strong>{loc.role}</strong></div>;
  }

  /* -----------------------------
     Small UI helpers
     ----------------------------- */
  const toggleSharing = async () => {
    if (sharing) {
      // stop: remove location then stop watch
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

  /* -----------------------------
     Main render
     ----------------------------- */
  return (
    <div className="App min-h-screen bg-black-50 p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Notifications / Controls */}
        <div className="col-span-1 space-y-4">
          <div className="p-4 bg-white rounded shadow">
            <h2 className="text-lg font-semibold">Session</h2>
            {!userRole && showRoleModal && (
              <div className="mt-4">
                <p className="mb-2">Who are you?</p>
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => handleRoleSelect('viewer')}>Viewer</button>
                  <button className="px-3 py-2 bg-green-500 text-white rounded" onClick={() => handleRoleSelect('cleaner')}>Cleaner</button>
                  <button className="px-3 py-2 bg-blue-500 text-white rounded" onClick={() => handleRoleSelect('customer')}>Customer</button>
                </div>
              </div>
            )}

            <div className="mt-4">
              <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={toggleSharing}>
                {sharing ? 'Stop Sharing' : 'Start Sharing'}
              </button>
              <button className="ml-2 px-3 py-2 bg-white border rounded" onClick={openProfileModal}>
                Profile
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-600">
              <div>Role: <strong>{userRole || '—'}</strong></div>
              <div>Device: {deviceId}</div>
              <div>Session: {sessionId ? sessionId.slice(0, 20) : '—'}</div>
              {/* For customers show sharing status; for cleaners show Online/Offline or On Job */}
              <div>Availability: <strong>
                {userRole === 'cleaner'
                  ? (activeJob ? 'On Job' : (isAvailable ? 'Online' : 'Offline'))
                  : (userRole === 'customer' ? (sharing ? 'Online' : 'Offline') : '-')}
              </strong></div>
            </div>
          </div>

          {/* Notifications */}
          <div className="p-4 bg-white rounded shadow space-y-2">
            <h3 className="font-semibold">Notifications</h3>

            {customerNotice && (
              <div className={`p-3 rounded ${customerNotice.type === 'error' ? 'bg-red-50' : customerNotice.type === 'success' ? 'bg-green-50' : 'bg-blue-50'}`}>
                <strong>{customerNotice.title}</strong>
                <div>{customerNotice.body}</div>
                <div className="mt-2"><button onClick={() => setCustomerNotice(null)} className="px-2 py-1 bg-gray-200 rounded">Dismiss</button></div>
              </div>
            )}

            {incomingMessage && (
              <div className="p-2 bg-yellow-50 rounded">
                <div><strong>Message:</strong> {incomingMessage.text}</div>
                <div className="mt-2"><button onClick={() => { setChatWith(incomingMessage.senderId); setIncomingMessage(null); }} className="px-2 py-1 bg-gray-200 rounded">Open Chat</button></div>
              </div>
            )}

            {/* Active job or incoming request panel */}
            {activeJob ? (
              <div className="p-2 border rounded">
                <div className="font-semibold">Job active</div>
                <div>Customer: {activeJob.customerUid}</div>
                <div>Booking: {activeJob.bookingId}</div>
                <div className="mt-2 flex gap-2">
                  <button className="px-2 py-1 bg-blue-500 text-white rounded" onClick={handleTrackCustomer} disabled={isProcessing}>Track Customer</button>
                  <button className="px-2 py-1 bg-green-500 text-white rounded" onClick={finishJob} disabled={isProcessing}>Finish Job</button>
                  <button className="px-2 py-1 bg-red-500 text-white rounded" onClick={() => cancelActiveJob('cancelled_by_cleaner')} disabled={isProcessing}>Cancel</button>
                </div>
              </div>
            ) : incomingRequest ? (
              <div className="p-2 border rounded">
                <div className="font-semibold">Incoming Request</div>
                <div>From: {incomingRequest.from}</div>
                <div className="mt-2 flex gap-2">
                  <button className="px-2 py-1 bg-blue-500 text-white rounded" onClick={handleTrackCustomer}>Track</button>
                  <button className="px-2 py-1 bg-green-500 text-white rounded" onClick={acceptRequest} disabled={isProcessing}>
                    {isProcessing ? 'Accepting...' : 'Accept'}
                  </button>
                  <button className="px-2 py-1 bg-red-500 text-white rounded" onClick={async () => {
                    await rtdbSet(rtdbRef(database, `requests/${user.uid}`), { ...incomingRequest, status: 'rejected' });
                    setIncomingRequest(null);
                  }} disabled={isProcessing}>Reject</button>
                </div>
              </div>
            ) : null}

            {currentCustomerRequest && userRole === 'customer' && currentCustomerRequest.status !== 'paid' && (
              <div className="p-2 border rounded">
                <div><strong>Your request is:</strong> {currentCustomerRequest.status}</div>
                <div className="mt-2">
                  <button className="px-2 py-1 bg-red-500 text-white rounded" onClick={cancelCustomerRequest}>Cancel Request</button>
                </div>
              </div>
            )}
          </div>

          {/* Chat / unread */}
          <div className="p-4 bg-white rounded shadow">
            <h3 className="font-semibold">Chats</h3>
            {Object.keys(unreadMessages).length > 0 ? (
              <div>
                <p>You have {Object.keys(unreadMessages).length} unread conversation(s)</p>
                <button className="px-2 py-1 bg-indigo-600 text-white rounded" onClick={() => {
                  const first = Object.keys(unreadMessages)[0];
                  setChatWith(first);
                  setUnreadMessages(prev => { const c = { ...prev }; delete c[first]; return c; });
                }}>Open</button>
              </div>
            ) : <p>No unread messages</p>}
          </div>
        </div>

        {/* Middle column: Map */}
        <div className="col-span-2 lg:col-span-2">
          <div className="bg-white rounded shadow p-2">
            <h2 className="text-lg font-semibold mb-2">Map</h2>
            <div style={{ height: '60vh' }} className="rounded overflow-hidden">
              <MapContainer center={[0, 0]} zoom={2} className="h-full w-full">
                {(targetCoords || currentCoords) && <RecenterMap coords={targetCoords || currentCoords} trigger={recenterTrigger} />}
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

                {/* Route if tracking */}
                {currentCoords && customerCoords && activeJob && <ManualRoute from={currentCoords} to={customerCoords} />}
                {currentCoords && targetCoords && <ManualRoute from={currentCoords} to={targetCoords} />}

                {/* Current device marker */}
                {currentCoords && (
                  <Marker position={[currentCoords.lat, currentCoords.lng]} icon={userMarkerIcon}>
                    <Popup>You (this device)</Popup>
                  </Marker>
                )}

                {/* Hardcoded demo cleaners */}
                {hardcodedCleaners.map((c) => (
                  <Marker key={c.id} position={[c.lat, c.lng]} icon={createRoleIcon('https://img.icons8.com/ios-filled/50/000000/broom.png', 'cleaner')}>
                    <Popup>
                      <div>
                        <strong>Demo Cleaner: {c.id}</strong>
                        <div className="mt-2">
                          <button className="px-2 py-1 bg-blue-500 text-white rounded" onClick={() => {
                            setTargetCoords({ lat: c.lat, lng: c.lng });
                            setRecenterTrigger(t => t + 1);
                          }}>Track This Cleaner</button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Live visible markers */}
                {visibleMarkers.map(([id, loc]) => {
                  const isSelf = loc.sessionId === sessionId || loc.uid === user?.uid;
                  return (
                    <Marker key={id} position={[loc.lat, loc.lng]} icon={createRoleIcon(
                      loc.role === 'cleaner'
                        ? 'https://img.icons8.com/ios-filled/50/000000/broom.png'
                        : 'https://img.icons8.com/ios-filled/50/000000/user.png',
                      loc.role
                    )}>
                      <Popup>
                        {renderPopupContentJSX(loc)}
                      </Popup>
                    </Marker>
                  );
                })}

              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-lg z-[10000]">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Profile</h3>
              <button onClick={() => setShowProfileModal(false)} className="px-2 py-1">Close</button>
            </div>
            <ProfileForm user={user} role={userRole} onClose={() => setShowProfileModal(false)} />
          </div>
        </div>
      )}

      {/* Payment Modal (demo) */}
      {showPaymentModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md relative z-[10000]">
            <h3 className="font-semibold">Payment (Demo)</h3>
            <p className="text-sm text-gray-600">Enter the amount to pay the cleaner. (Demo mode — no gateway)</p>

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

            {paymentReceipt && (
              <div className="mt-3 p-2 border rounded">
                <div><strong>Receipt ID:</strong> {paymentReceipt.id}</div>
                <div><strong>Amount:</strong> {paymentReceipt.amount}</div>
                <div className="mt-2 flex gap-2">
                  <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => {
                    // print with best-effort cleaner/customer names if available
                    const cleanerName = (ratingBookingContext && ratingBookingContext.cleanerId) || activeJob?.cleanerUid || currentCustomerRequest?.cleanerUid || 'Cleaner';
                    const customerName = userName || 'Customer';
                    printReceipt(paymentReceipt, paymentBookingId || activeJob?.bookingId || currentRequestId, cleanerName, customerName);
                  }}>Print Receipt</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && ratingBookingContext && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
          <div className="bg-white p-4 rounded shadow w-full max-w-md z-[10000]">
            <h3 className="font-semibold">Rate your Cleaner</h3>
            <p className="text-sm text-gray-600">Rate 1 (worst) - 5 (best)</p>
            <div className="mt-3 flex gap-2">
              {[1,2,3,4,5].map((s) => (
                <button key={s} className="px-3 py-2 bg-yellow-300 rounded" onClick={() => {
                  // capture rating and submit
                  submitRating(s, '');
                }}>{s}★</button>
              ))}
            </div>
            <div className="mt-3">
              <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => setShowRatingModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat box */}
      {chatWith && user?.uid && (
        <ChatBox conversationId={[user.uid, chatWith].sort().join('_')} recipientId={chatWith} onClose={() => setChatWith(null)} />
      )}
    </div>
  );
}

export default App;

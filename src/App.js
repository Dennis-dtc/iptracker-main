import './App.css';
import { use, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { database, ref, set, onValue } from './firebaseConfig';
import { get, remove } from 'firebase/database';
import { useMap } from 'react-leaflet';
import 'leaflet-routing-machine';
import ManualRoute from './ManualRoute';
import { v4 as uuidv4 } from 'uuid';
import { auth, signInAnonymously } from './firebaseConfig';
import ChatBox from './ChatBox';
import { onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
// ✅ RIGHT
import { firestore as db } from './firebaseConfig';
import { setCleanerAvailability } from './services/availabilityService';  // 🔝 Top of file
import { addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { update } from "firebase/database";




const createRoleIcon = (imageUrl, role = 'cleaner') => {
  return L.divIcon({
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
};

const userMarkerIcon = createRoleIcon(
  'https://img.icons8.com/ios-filled/50/000000/navigation.png', // or any custom image
  'you' // a special class in CSS (see next step)
);

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const targetIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

function RecenterMap({ coords, trigger }) {
  const map = useMap();

  useEffect(() => {
    if (coords) {
      map.setView(coords, map.getZoom(), {
        animate: true,
        duration: 0.5,
      });
    }
  }, [trigger]);

  return null;
}

function App() {
  const [currentCoords, setCurrentCoords] = useState(null);
  const [customerCoords, setCustomerCoords] = useState(null); 
  const [isTrackingCustomer, setIsTrackingCustomer] = useState(false);
  const [targetCoords, setTargetCoords] = useState(null);
  const [deviceId, setDeviceId] = useState(null); 
  const [sessionId, setSessionId] = useState(null); // NEW
  // track current booking (Firestore) and RTDB request key
  const [currentRequestId, setCurrentRequestId] = useState(null);   // Firestore booking doc id
  const [currentRequestKey, setCurrentRequestKey] = useState(null); // RTDB request key (e.g. cleaner uid or sessionId)
  const [sharing, setSharing] = useState(false);
  const [mode, setMode] = useState(null); 
  const [allLocations, setAllLocations] = useState({});
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userImage, setUserImage] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false); 
  const [showRoleModal, setShowRoleModal] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [chatWith, setChatWith] = useState(null);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [incomingMessage, setIncomingMessage] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({});
  const [isAvailable, setIsAvailable] = useState(true);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [customerNotice, setCustomerNotice] = useState(null); // for customer popup
  const [currentCustomerRequest, setCurrentCustomerRequest] = useState(null); 
  // JOB / CLEANER UX STATE
  const [activeJob, setActiveJob] = useState(null); // { cleanerUid, customerUid, bookingId, status }
  const [isProcessing, setIsProcessing] = useState(false); // show spinner / disable buttons during DB writes



const toggleAvailability = async () => {
  const newStatus = !isAvailable;
  setIsAvailable(newStatus);

  if (deviceId && userRole === 'cleaner') {
    await setCleanerAvailability(deviceId, newStatus);
  }
};

  const handleSubmitUserInfo = () => {
  if (!userName || !userRole) {
    alert("Please enter your name and select a role.");
    return;
  }
  setSharing(true);        // Start sharing location
  setHasSubmitted(true);   // Hide form
};


const enforceDeviceLimitAndSave = async (_deviceId, coords) => {
  if (!coords?.lat || !coords?.lng || !sessionId) return; // require sessionId
  const safeSessionId = sessionId.replace(/\./g, '_');
  const locationsRef = ref(database, 'locations');

  try {
    // Apply small offset for customer (simulate ~100m)
    let adjustedCoords = { ...coords };
    if (userRole === 'customer') {
      const offsetMeters = 100; // ~100 meters
      const earthRadius = 6378137;
      const dLat = (offsetMeters / earthRadius) * (180 / Math.PI);
      const dLng =
        (offsetMeters / (earthRadius * Math.cos((Math.PI * coords.lat) / 180))) *
        (180 / Math.PI);

      adjustedCoords = {
        lat: coords.lat + dLat,
        lng: coords.lng + dLng,
      };

      console.log("📍 Customer offset applied (~100m east):", adjustedCoords);
    }

    await set(ref(database, `locations/${safeSessionId}`), {
      sessionId: safeSessionId,            // NEW: session id
      deviceId: deviceId || null,         // original device id (browser)
      uid: auth.currentUser?.uid || null, // firebase auth id (may be same for two tabs)
      role: userRole || 'cleaner',
      name: userName || 'Anonymous',
      lat: adjustedCoords.lat,
      lng: adjustedCoords.lng,
      timestamp: Date.now(),
      isAvailable: isAvailable,
    });

    console.log(`💾 Saved location for ${safeSessionId}`, adjustedCoords);
  } catch (err) {
    console.error("❌ Error saving location:", err);
  }
};




const hardcodedCleaners = [
  {
    id: 'cleaner_1',
    lat: -1.290,
    lng: 36.820,
  },
  {
    id: 'cleaner_2',
    lat: -1.300,
    lng: 36.830,
  },
  {
    id: 'cleaner_3',
    lat: -1.310,
    lng: 36.840,
  },
];

useEffect(() => {
  if (!sharing || userRole === 'viewer') return;
  if (!sessionId) return; // wait until sessionId exists

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      let lat = pos.coords.latitude;
      let lng = pos.coords.longitude;

      const coords = { lat, lng };
      setCurrentCoords(coords);
      console.log("📍 My location (currentCoords):", coords);

      enforceDeviceLimitAndSave(deviceId, coords);
    },
    (err) => {
      console.error('Error getting location:', err);
    },
    { enableHighAccuracy: true }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}, [mode, deviceId, sessionId, sharing]);


const handleRoleSelect = async (role) => {
  setSelectedRole(role);
  setUserRole(role);
  setShowRoleModal(false);

  // base device id per browser (keeps previous behavior)
  let existingId = localStorage.getItem('deviceId');
  if (!existingId || !existingId.startsWith(role)) {
    const rawId = uuidv4();
    existingId = `${role}_${rawId}`;
    localStorage.setItem('deviceId', existingId);
  }

  // create a new session instance id so same browser can simulate multiple sessions
  const instance = `${existingId}_${uuidv4().slice(0,6)}`; // e.g. customer_ab12cd_3f4e5a
  setDeviceId(existingId);   // keep for backward compatibility
  setSessionId(instance);    // IMPORTANT: this is what we will write to RTDB
  setSharing(true);
  setMode(role === 'viewer' ? 'track' : 'share');

  // Optional cleanup of orphaned anonymous markers of same role
  try {
    const locationsRef = ref(database, 'locations');
    const snapshot = await get(locationsRef);
    const data = snapshot.val();

    if (data) {
      for (const [id, loc] of Object.entries(data)) {
        if (loc.name === 'Anonymous' && loc.role === role && id !== instance) {
          await remove(ref(database, `locations/${sessionId}`));
          console.log(`🧹 Cleaned up old ${role} marker: ${id}`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  }

  console.log("✅ Role selected:", role, "sessionId:", instance);
};


useEffect(() => {
  let storedId = localStorage.getItem('deviceId');

  if (!storedId) {
    // No saved deviceId → generate one
    storedId = uuidv4();
    localStorage.setItem('deviceId', storedId);
  }

  setDeviceId(storedId);
}, []);


useEffect(() => {
  if (userRole !== 'customer' || !user?.uid) return;

  const customerRequestsRef = ref(database, 'requests');
  const unsubscribe = onValue(customerRequestsRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  // Find requests that this customer sent
  const myRequests = Object.entries(data).filter(
    ([, req]) => req.from === user.uid
  );

  if (myRequests.length > 0) {
    const [, latest] = myRequests[myRequests.length - 1];
    console.log("📢 Cleaner response:", latest.status);

    // ✅ show UI box like cleaner’s modal
    if (latest.status === 'accepted') {
      setCustomerNotice({
        title: "Request Accepted",
        body: "Cleaner is on the way 🚀",
        type: "success",
      });
    } else if (latest.status === 'rejected') {
      setCustomerNotice({
        title: "Request Rejected",
        body: "Cleaner declined. Try another.",
        type: "error",
      });
    }
  }

  // ✅ track cleaner location if accepted
  if (data.customerLat && data.customerLng) {
    setCustomerCoords({
      lat: data.customerLat,
      lng: data.customerLng,
    });
  }

});

  
  return () => {
    unsubscribe();
    console.log("🧹 Customer request listener unsubscribed.");
  };
}, [userRole, user?.uid]);

useEffect(() => {
  // Anonymous sign-in on app load
  signInAnonymously(auth)
    .then(() => {
      console.log("✅ Signed in anonymously to Firebase");
    })
    .catch((err) => {
      console.error("❌ Firebase anonymous sign-in error:", err);
    });
}, []);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      setUser(firebaseUser);
      console.log("✅ User signed in:", firebaseUser.uid);
    } else {
      // Try signing in anonymously
      signInAnonymously(auth)
        .then((userCred) => {
          setUser(userCred.user);
          console.log("✅ Signed in anonymously:", userCred.user.uid);
        })
        .catch((error) => {
          console.error("❌ Anonymous sign-in failed:", error);
        });
    }
  });

  return () => unsubscribe();
}, []);

useEffect(() => {
  const locationsRef = ref(database, 'locations');

  const unsubscribe = onValue(locationsRef, (snapshot) => {
    const data = snapshot.val() || {};
    console.log("📥 Real-time locations update:", data);
    setAllLocations(data);
  });

  return () => unsubscribe();
}, []);

// Subscribe to customer live position via the allLocations object
useEffect(() => {
  if (!activeJob?.customerUid || !allLocations) {
    setCustomerCoords(null);
    return;
  }

  // find customer's latest location entry (they're stored under sessionId keys)
  const entry = Object.entries(allLocations).find(([id, loc]) => loc.uid === activeJob.customerUid);
  if (entry) {
    const [, loc] = entry;
    setCustomerCoords({ lat: loc.lat, lng: loc.lng });
    // keep targetCoords in sync so route updates
    setTargetCoords({ lat: loc.lat, lng: loc.lng });
  } else {
    // no location found — clear or leave last known
    console.warn("Customer location not found in allLocations for", activeJob.customerUid);
  }
}, [allLocations, activeJob?.customerUid]);



useEffect(() => {
  if (!user?.uid) return;

  const q = query(
    collectionGroup(db, "messages"),
    where("recipientId", "==", user.uid),
    orderBy("timestamp", "desc")
  );

  const unsub = onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const latest = snapshot.docs[0].data();

      const senderId = latest.senderId;
      const conversationId = [latest.senderId, user.uid].sort().join('_');

      if (senderId !== user.uid && senderId !== chatWith) {
        // 👇 Mark sender as having an unread message
        setUnreadMessages(prev => ({
          ...prev,
          [senderId]: true
        }));

        setIncomingMessage({
          text: latest.text,
          senderId,
          conversationId
        });

        // Optional auto-dismiss notification popup
        setTimeout(() => setIncomingMessage(null), 5000);
      }
    }
  });

  return () => unsub();
}, [user?.uid, chatWith]);

  const visibleMarkers = Object.entries(allLocations).filter(([id, loc]) => {
  if (!loc?.lat || !loc?.lng || !(loc?.uid || loc?.sessionId) || !loc?.role) return false;

  // CUSTOMER VIEW
  if (userRole === 'customer') {
    
    if (loc.role !== 'cleaner') return false; // only show cleaners

    if (currentCustomerRequest && currentCustomerRequest.cleanerUid) {
      // Requester sees only the cleaner they requested
      return loc.uid === currentCustomerRequest.cleanerUid;
    }

    // If no active request, show all available cleaners
    return loc.isAvailable !== false;
  }

  // CLEANER VIEW
  if (userRole === 'cleaner') {
    // Cleaner sees all customers who are "available" (you can define your logic)
    return loc.role === 'customer' && loc.isAvailable !== false;
  }

  // VIEWER or other roles
  return false;
});



  const renderPopupContent = (loc) => {
    const isSelf = loc.sessionId === sessionId || loc.uid === user?.uid;

    const clientCanTrack = true; // simulate permission system for now

if (userRole === 'customer' && loc.role === 'cleaner') {
  const hasActiveRequest = currentRequestId || currentRequestKey;

  return (
    <div className="user-card">
      <div className="user-info">
        <strong className="user-name">{loc.name || 'Cleaner'}</strong>
        <div className="user-role">({loc.role})</div>
      </div>

      <div className="user-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            setTargetCoords(loc);
            setRecenterTrigger(prev => prev + 1);
          }}
        >
          Track Cleaner
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => handleOpenChat(loc.uid)}
        >
          Chat with Cleaner
        </button>

        <button
          className="btn btn-secondary"
          disabled={hasActiveRequest}
          onClick={() => {
            if (hasActiveRequest) {
              alert("⏳ You already have a pending or accepted request.");
              return;
            }
            requestCleaner(loc.uid);
            // Optional: close popup immediately
            const popups = document.getElementsByClassName('leaflet-popup-close-button');
            if (popups.length) popups[0].click();
          }}
        >
          {hasActiveRequest ? "Request Sent" : "Request"}
        </button>
      </div>
    </div>
  );
}


    // Don't show popup buttons for yourself
    if (isSelf) {
      return <strong>You (This Device)</strong>;
    }

    // Viewer: Only show name
    if (userRole === 'viewer') {
      return (
        <div>
          <strong>{loc.name || 'Unknown'}</strong>
          <br />
          <em>({loc.role})</em>
        </div>
      );
    }

    // Cleaner: Can see customers only, but no chat or track
    if (userRole === 'cleaner') {
      return (
        <div>
          <strong>{loc.name || 'Customer'}</strong>
          <br />
          <em>(Customer)</em>
        </div>
      );
    }

  // Customer: Can see cleaners, and can chat + track
  if (userRole === 'customer' && loc.role === 'cleaner') {
    return (
      <div>
        <strong>{loc.name || 'Cleaner'}</strong>
        <br />
        <button onClick={() => {
          setTargetCoords(loc);
          setRecenterTrigger(prev => prev + 1);
        }}>
          Track Cleaner
        </button>
        <br />
        <button onClick={() => handleOpenChat(loc.uid)}>Show Chat</button>
        {/* <button onClick={() => setChatWith(loc.uid)}>Chat</button> */}
      </div>
    );
  }

  return <div><strong>{loc.name}</strong></div>;
};

const handleOpenChat = (uid) => {
  setChatWith(uid);
  setUnreadMessages(prev => {
    const updated = { ...prev };
    delete updated[uid]; // Mark message as read
    return updated;
  });
};

const requestCleaner = async (cleanerUid) => {
  if (!user?.uid || userRole !== 'customer') {
    alert("Only customers can request cleaners.");
    return;
  }

  const requestRef = ref(database, `requests/${cleanerUid}`);
  await set(requestRef, {
    from: user.uid,
    cleanerUid,      // 🔥 Save cleaner UID
    status: 'pending',
    timestamp: Date.now(),
  });

  console.log(`📩 Sent cleaning request from ${user.uid} to ${cleanerUid}`);

  // store in state for UI
  setCurrentCustomerRequest({
    cleanerUid,
    status: 'pending'
  });
};


// ✅ Cleaner incoming request listener

useEffect(() => {
  if (userRole !== 'cleaner' || !user?.uid) return;

  const requestRef = ref(database, `requests/${user.uid}`);

  const unsubscribe = onValue(requestRef, (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      // no request
      setIncomingRequest(null);
      return;
    }

    // If request is pending -> show incomingRequest
    if (data.status === 'pending') {
      setIncomingRequest(data);
      return;
    }

    // If status changed to accepted/rejected/cancelled and we are the cleaner:
    if (data.status === 'cancelled') {
      // if we had an activeJob for this customer, clear it
      if (activeJob?.customerUid && activeJob.customerUid === data.from) {
        setActiveJob(null);
        setIsTrackingCustomer(false);
        setCurrentRequestId(null);
        setCurrentRequestKey(null);
        setIsAvailable(true);
        setCustomerNotice({ title: "Request cancelled", body: "Customer cancelled the request.", type: "error" });
      }
      setIncomingRequest(null);
      return;
    }

    // If accepted by some other flow (shouldn't happen) --> keep logic defensive
    if (data.status === 'accepted') {
      // show an accepted state briefly (but cleaner accepted by themself through UI)
      setIncomingRequest(data); // optional: show accepted state if needed
      return;
    }

    // default: keep incomingRequest empty
    setIncomingRequest(null);
  });

  return () => unsubscribe();
}, [user?.uid, userRole, activeJob]);


// ✅ Cleaner accepts request
// ✅ Cleaner accepts request (REPLACED)
const acceptRequest = async () => {
  if (!incomingRequest?.from) {
    alert("No request data available.");
    return;
  }

  setIsProcessing(true);

  try {
    const requestKey = user.uid; // path: requests/{cleanerUid}
    const reqRef = ref(database, `requests/${requestKey}`);

    // mark RTDB request accepted so customer sees it immediately
    await set(reqRef, { ...incomingRequest, status: 'accepted', acceptedAt: Date.now() });

    // ensure cleaner's location is saved and marked unavailable
    if (sessionId) {
      const locRef = ref(database, `locations/${sessionId}`);
      await set(locRef, {
        sessionId,
        deviceId,
        role: userRole,
        name: userName,
        uid: auth.currentUser?.uid || null,
        isAvailable: false,
        timestamp: Date.now(),
        lat: currentCoords?.lat ?? null,
        lng: currentCoords?.lng ?? null,
      });
    }

    // create booking in Firestore and capture booking id
    const bookingRef = await addDoc(collection(db, 'bookings'), {
      cleanerUid: user.uid,
      customerUid: incomingRequest.from,
      status: 'accepted',
      createdAt: serverTimestamp(),
    });

    // Update local state to reflect active job
    const job = {
      cleanerUid: user.uid,
      customerUid: incomingRequest.from,
      bookingId: bookingRef.id,
      status: 'accepted',
      startedAt: Date.now(),
    };

    setActiveJob(job);
    setCurrentRequestId(bookingRef.id);
    setCurrentRequestKey(requestKey);
    setIsTrackingCustomer(true);
    setIsAvailable(false); // prevent toggle mistakes
    setIncomingRequest(null); // close incoming request UI
    setIsProcessing(false);

    // small UI feedback
    setCustomerNotice({
      title: "You accepted the request",
      body: "Tracking customer... show route on map.",
      type: "success",
    });

    console.log("📘 Booking created in Firestore. id=", bookingRef.id);
  } catch (err) {
    console.error("❌ Error accepting request:", err);
    setIsProcessing(false);
    alert("Failed to accept request — check console.");
  }
};



// ✅ Customer feedback listener
useEffect(() => {
  if (userRole !== 'customer' || !user?.uid) return;

  const customerRequestsRef = ref(database, 'requests');
  const unsubscribe = onValue(customerRequestsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const myRequests = Object.entries(data).filter(
      ([, req]) => req.from === user.uid
    );

    if (myRequests.length > 0) {
      const [, latest] = myRequests[myRequests.length - 1];

      setCurrentCustomerRequest({
        cleanerUid: latest.to || latest.cleanerUid || null,
        status: latest.status
      });

      if (latest.status === 'accepted') {
        setCustomerNotice({
          title: "Cleaner Accepted Your Request",
          body: "Your cleaner is on the way! 🚀",
          type: "success",
        });
      } else if (latest.status === 'rejected') {
        setCustomerNotice({
          title: "Cleaner Rejected Your Request",
          body: "Try requesting another cleaner.",
          type: "error",
        });
        setCurrentCustomerRequest(null);
      }
    } else {
      setCurrentCustomerRequest(null);
    }
  });

  return () => unsubscribe();
}, [userRole, user?.uid]);




const handleTrackCustomer = () => {
  console.log("🔍 Incoming request from UID:", incomingRequest?.from);

  if (!incomingRequest?.from || !allLocations) {
    alert("Missing customer data.");
    return;
  }

  const customerLocEntry = Object.entries(allLocations).find(
    ([id, loc]) => loc.uid === incomingRequest.from
  );

  if (customerLocEntry) {
    const [, customerLoc] = customerLocEntry;

    setTargetCoords({
      lat: customerLoc.lat,
      lng: customerLoc.lng,
    });

    setRecenterTrigger(prev => prev + 1);
    console.log("📍 Tracking customer at:", customerLoc);
  } else {
    console.warn("❌ Could not find customer location in allLocations");
    alert("Customer location not found.");
  }
};

// Place this inside your App component, **above the return()**
const cancelCustomerRequest = async () => {
  if (!currentCustomerRequest) {
    alert("No active request to cancel.");
    return;
  }

  // fallback: try to get cleanerUid from RTDB path or Firestore booking
  const cleanerUid = currentCustomerRequest.cleanerUid || currentRequestKey;
  if (!cleanerUid) {
    alert("Cannot find cleaner for this request.");
    return;
  }

  try {
    // Update Firebase Realtime Database
    const reqRef = ref(database, `requests/${cleanerUid}`);
    await set(reqRef, {
      from: user.uid,
      status: 'cancelled',
      timestamp: Date.now(),
    });

    // Update Firestore booking if exists
    if (currentRequestId) {
      await updateDoc(doc(db, "bookings", currentRequestId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    }

    // Clear local states so UI updates
    setCurrentCustomerRequest(null);
    setCurrentRequestId(null);
    setCurrentRequestKey(null);

    alert("❌ Your request was cancelled.");
  } catch (err) {
    console.error("❌ Error cancelling request:", err);
    alert("❌ Failed to cancel request. Check console.");
  }
};


const rejectRequest = async () => {
  const reqRef = ref(database, `requests/${user.uid}`);
  await set(reqRef, { ...incomingRequest, status: 'rejected' });

  setIncomingRequest(null);
};

// Cleaner finishes the job
const finishJob = async () => {
  if (!activeJob?.bookingId || !activeJob?.customerUid) {
    alert("No active job to finish.");
    return;
  }

  setIsProcessing(true);
  try {
    // update Firestore booking
    await updateDoc(doc(db, "bookings", activeJob.bookingId), {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });

    // update RTDB request so customer gets instant update
    if (currentRequestKey) {
      const reqRef = ref(database, `requests/${currentRequestKey}`);
      await set(reqRef, {
        from: activeJob.customerUid,
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    // mark cleaner available again in locations
    if (sessionId) {
      const locRef = ref(database, `locations/${sessionId}`);
      await set(locRef, {
        sessionId,
        deviceId,
        role: userRole,
        name: userName,
        uid: auth.currentUser?.uid || null,
        isAvailable: true,
        timestamp: Date.now(),
        lat: currentCoords?.lat ?? null,
        lng: currentCoords?.lng ?? null,
      });
    }

    // cleanup local state
    setActiveJob(null);
    setCurrentRequestId(null);
    setCurrentRequestKey(null);
    setIsTrackingCustomer(false);
    setIsAvailable(true);
    setIsProcessing(false);

    setCustomerNotice({ title: "Job completed", body: "Thanks — job finished.", type: "success" });
  } catch (err) {
    console.error("❌ finishJob failed:", err);
    setIsProcessing(false);
    alert("Failed to complete job. Check console.");
  }
};

// Cleaner cancels the active job (manual cancel)
const cancelActiveJob = async (reason = 'cancelled_by_cleaner') => {
  if (!activeJob?.customerUid) {
    alert("No active job to cancel.");
    return;
  }

  setIsProcessing(true);
  try {
    // mark RTDB request cancelled
    if (currentRequestKey) {
      const reqRef = ref(database, `requests/${currentRequestKey}`);
      await set(reqRef, {
        from: activeJob.customerUid,
        status: 'cancelled',
        reason,
        timestamp: Date.now(),
      });
    }

    // update Firestore if exists
    if (activeJob.bookingId) {
      await updateDoc(doc(db, "bookings", activeJob.bookingId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    }

    // mark cleaner available again in locations
    if (sessionId) {
      const locRef = ref(database, `locations/${sessionId}`);
      await set(locRef, {
        sessionId,
        deviceId,
        role: userRole,
        name: userName,
        uid: auth.currentUser?.uid || null,
        isAvailable: true,
        timestamp: Date.now(),
        lat: currentCoords?.lat ?? null,
        lng: currentCoords?.lng ?? null,
      });
    }

    setActiveJob(null);
    setCurrentRequestId(null);
    setCurrentRequestKey(null);
    setIsTrackingCustomer(false);
    setIsAvailable(true);
    setIsProcessing(false);

    setCustomerNotice({ title: "Job cancelled", body: "You cancelled the job.", type: "error" });
  } catch (err) {
    console.error("❌ cancelActiveJob failed:", err);
    setIsProcessing(false);
    alert("Failed to cancel job. Check console.");
  }
};



  return (
    <div className="App">
      <div className="box1">
          <div className="notification-panel">
            {/* New Message Notification */}
            {incomingMessage && (
              <div className="notification message-notification">
                <strong>📨 New message:</strong> {incomingMessage.text}
                <button onClick={() => {
                  setChatWith(incomingMessage.senderId);
                  setIncomingMessage(null);
                }}>Open Chat</button>
              </div>
            )}
            {customerNotice && (
              <div className={`notification ${customerNotice.type}`}>
                <strong>{customerNotice.title}</strong>
                <p>{customerNotice.body}</p>
                <button onClick={() => setCustomerNotice(null)}>OK</button>
              </div>
              )}
                        
            {currentCustomerRequest && currentCustomerRequest.status !== 'completed' && (
              <div className="notification request-status">
                <strong>🧹 Your request is {currentCustomerRequest.status}</strong>
                <button 
                  className="btn btn-danger" 
                  onClick={cancelCustomerRequest}
                >
                  Cancel Request
                </button>
              </div>
            )}




{/* Incoming Cleaner Request OR Active Job */}
{activeJob ? (
  <div className="notification job-active">
    <strong>🔧 Job active</strong>
    <p>Customer: {activeJob.customerUid}</p>
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-info" onClick={handleTrackCustomer} disabled={isProcessing}>
        Track Customer
      </button>
      <button className="btn btn-success" onClick={finishJob} disabled={isProcessing}>
        Finish Job
      </button>
      <button className="btn btn-danger" onClick={() => cancelActiveJob('cancelled_by_cleaner')} disabled={isProcessing}>
        Cancel Job
      </button>
    </div>
  </div>
) : incomingRequest ? (
  <div className="notification request-notification">
    <strong> New Cleaning Request</strong>
    <p>From: {incomingRequest.from}</p>
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={handleTrackCustomer} className="btn btn-info" disabled={isProcessing}>Track Customer</button>
      <button
        className="btn btn-success"
        onClick={async () => {
          await acceptRequest();
          // handleTrackCustomer() will pick up from activeJob via effect
        }}
        disabled={isProcessing}
      >
        {isProcessing ? "Accepting..." : "Accept"}
      </button>
      <button onClick={rejectRequest} className="btn btn-danger" disabled={isProcessing}>Reject</button>
    </div>
  </div>
) : null}

            {Object.keys(unreadMessages).length > 0 && (
              <div className="notification message-alert">
                <strong>Check your chats here</strong>
                <p>🛎️ You have {Object.keys(unreadMessages).length} unread message(s)</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    // Open the most recent unread sender
                    const firstUnreadSenderId = Object.keys(unreadMessages)[0];
                    setChatWith(firstUnreadSenderId);

                    // Clear that sender from unread messages
                    setUnreadMessages((prev) => {
                      const updated = { ...prev };
                      delete updated[firstUnreadSenderId];
                      return updated;
                    });
                  }}
                >
                  View
                </button>
              </div>
            )}

            {/* {Object.keys(unreadMessages).length > 0 && (
              <div className="notification-bell">
                🛎️ {Object.keys(unreadMessages).length} new message(s)
              </div>
            )} */}
          </div>
          {showRoleModal && (
            <div className="modal-backdrop bg-green-200">
              <div className="modal-content">
                <h2>Welcome!</h2>
                <p>Who are you?</p>
                <button onClick={() => handleRoleSelect('viewer')}>Viewer</button>
                <button onClick={() => handleRoleSelect('cleaner')}>Cleaner</button>
                <button onClick={() => handleRoleSelect('customer')}>Customer</button>
              </div>
            </div>
          )}

            {/* <div className="other-content"> */}
              <h1>Find a nearby cleaner</h1>

        <div className="box2">
          
          <MapContainer center={[0, 0]} zoom={2} className="map">
            {(targetCoords || currentCoords) && (
              <RecenterMap coords={targetCoords || currentCoords} trigger={recenterTrigger} />
            )}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />

            {/* ✅ Show route if a cleaner is selected */}
            {currentCoords && targetCoords && (
              <ManualRoute from={currentCoords} to={targetCoords} />
            )}

            {isTrackingCustomer && customerCoords && currentCoords && (
              <ManualRoute from={currentCoords} to={customerCoords} />
            )}


            {/* ✅ Show marker for current device */}
            {currentCoords && (
              <Marker 
                position={currentCoords} 
                // icon={userIcon}
                icon={userMarkerIcon}
              >
                <Popup>You (This Device)</Popup>
              </Marker>
            )}

            {hardcodedCleaners.map((cleaner) => (
              <Marker
                key={cleaner.id}
                position={[cleaner.lat, cleaner.lng]}
                // icon={targetIcon}
                icon={createRoleIcon('https://img.icons8.com/ios-filled/50/000000/broom.png', 'cleaner')}
              >
                <Popup>
                  <strong>Demo Cleaner:</strong> {cleaner.id}
                  <br />
                  <em>This is a dummy location for testing</em>
                  <br />
                  <button
                    onClick={() => {
                      setTargetCoords({ lat: cleaner.lat, lng: cleaner.lng });
                      setRecenterTrigger((prev) => prev + 1); // triggers map recenter
                    }}
                  >
                    Track This Cleaner
                  </button>

                </Popup>
              </Marker>
            ))}

              {visibleMarkers.map(([id, loc]) => {
                const isUnread = unreadMessages[loc.uid]; // ✅ OK here
                const isSelf = loc.uid === user?.uid;

                return (
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
                    <Popup autoClose={true}>
                      {renderPopupContent(loc)}
                    </Popup>

                    {/* ✅ Show unread bubble if needed */}
                    {isUnread && !isSelf && (
                      <div className="message-bubble" style={{
                        position: 'absolute',
                        transform: 'translate(-50%, -100%)',
                        top: '-25px',
                        left: '50%',
                        zIndex: 1000,
                      }}>
                        <img
                          src="https://img.icons8.com/emoji/48/new-button-emoji.png"
                          alt="New message"
                          style={{ width: 24, height: 24 }}
                        />
                      </div>
                    )}
                  </Marker>
                );
              })}
        
          </MapContainer>
        
        </div>
      </div>
<div className="control-panel">
  <div className="panel-content">
    <div className="search-form">
      <button
        onClick={async () => {
          if (sharing) {
            // 🧹 Stop sharing: remove location + reset flags
            if (deviceId || sessionId) {
              await remove(ref(database, `locations/${sessionId || deviceId}`));
            }
            setSharing(false);
            setIsAvailable(false);
            alert("🛑 You stopped sharing your location.");
          } else {
            setSharing(true);
            alert("✅ Location sharing started.");
          }
        }}
      >
        {sharing ? 'Stop Sharing' : 'Start Sharing'}
      </button>
    </div>

    {/* <div className="mode-buttons">
      <label>
        <input
          type="checkbox"
          checked={sharing}
          onChange={() => setSharing(!sharing)}
        />
        Share My Location
      </label>
    </div> */}

    {/*
      Fix: Wrapped JSX in parentheses and removed invalid 'customer' call.
      Keeps the availability toggle for cleaners only.
    */}
    {userRole === 'cleaner' && (
      <div className="availability-toggle">
        <div className="toggle-row">
          <label className="switch">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={toggleAvailability}
            disabled={!!activeJob} // disable when on an active job
          />

            <span className="slider"></span>
          </label>
          <span className={`status-text ${isAvailable ? 'online' : 'offline'}`}>
            {activeJob ? ' On Job' : (isAvailable ? ' Online' : ' Offline')}
          </span>

        </div>
      </div>
    )}

    <div className="info-section">
      {selectedRole === 'viewer' && (
        <p>You are viewing the map as a guest. No location access needed.</p>
      )}

      {selectedRole && selectedRole !== 'viewer' && currentCoords && (
        <p>
          <strong>Your location:</strong> {currentCoords.lat}, {currentCoords.lng}
        </p>
      )}
    </div>
  </div>
</div>

      {chatWith && user?.uid && (
        <ChatBox
          conversationId={[auth.currentUser.uid, chatWith].sort().join('_')}
          recipientId={chatWith}
          onClose={() => setChatWith(null)} // ✅ Add close handler
        />
      )}

      {Object.keys(unreadMessages).length > 0 && (
        <div className="notification-bell">
          🛎️ {Object.keys(unreadMessages).length} new message(s)
        </div>
      )}

    </div>
  );
}

export default App;


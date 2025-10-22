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
import { addDoc, serverTimestamp } from 'firebase/firestore';



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
  const [targetCoords, setTargetCoords] = useState(null);
  const [deviceId, setDeviceId] = useState(null); 
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


const enforceDeviceLimitAndSave = async (deviceId, coords) => {
  if (!coords?.lat || !coords?.lng || !deviceId) return;
  const safeDeviceId = deviceId.replace(/\./g, '_');
  const locationsRef = ref(database, 'locations');

  try {
    // ✅ Apply small offset for customer (simulate being ~100m away)
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

    // ✅ Save normally (no jitter, just offset if needed)
    await set(ref(database, `locations/${safeDeviceId}`), {
      lat: adjustedCoords.lat,
      lng: adjustedCoords.lng,
      timestamp: Date.now(),
      role: userRole || 'cleaner',
      name: userName || 'Anonymous',
      uid: auth.currentUser?.uid || null,
      isAvailable: true,
    });

    console.log(`💾 Saved location for ${safeDeviceId}`, adjustedCoords);
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
}, [mode, deviceId]);

const handleRoleSelect = async (role) => {
  setSelectedRole(role);
  setUserRole(role);
  setShowRoleModal(false);

  if (role !== 'viewer') {
    // 🔹 Try to reuse same ID if it exists
    let existingId = localStorage.getItem('deviceId');
    
    if (!existingId || !existingId.startsWith(role)) {
      // If no saved one or role changed → generate new
      const rawId = uuidv4();
      existingId = `${role}_${rawId}`;
      localStorage.setItem('deviceId', existingId);
    }

    setDeviceId(existingId);
    setSharing(true);
    setMode('share');

    // 🔹 Optional cleanup: remove old orphaned markers
    // Only remove entries belonging to this same device/role
    try {
      const locationsRef = ref(database, 'locations');
      const snapshot = await get(locationsRef);
      const data = snapshot.val();

      if (data) {
        for (const [id, loc] of Object.entries(data)) {
          // if old marker from same role & name "Anonymous" remains
          if (loc.name === 'Anonymous' && loc.role === role && id !== existingId) {
            await remove(ref(database, `locations/${id}`));
            console.log(`🧹 Cleaned up old ${role} marker: ${id}`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Cleanup error:", err);
    }

  } else {
    // Viewer doesn’t need to share
    setDeviceId(null);
    setSharing(false);
    setMode('track');
  }

  console.log("✅ Role selected:", role);
  console.log("🧭 Mode set to:", role === 'viewer' ? 'track' : 'share');
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

  const visibleMarkers = Object.entries(allLocations)
  .filter(([id, loc]) => {
    if (!loc?.lat || !loc?.lng || !loc?.uid || !loc?.role) return false;

    if (userRole === 'viewer') {
      return loc.role === 'cleaner' || loc.role === 'customer';
    }

    // Cleaners see customers
    if (userRole === 'cleaner') {
      return loc.role === 'customer' && loc.isAvailable;
    }

    // Customers see cleaners
    if (userRole === 'customer') {
      return loc.role === 'cleaner' && loc.isAvailable;
    }

    return false;
  });

  const renderPopupContent = (loc) => {
    const isSelf = loc.uid === user?.uid;
    const clientCanTrack = true; // simulate permission system for now

    if (userRole === 'customer' && loc.role === 'cleaner' && clientCanTrack) {
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
              onClick={() => requestCleaner(loc.uid)}
            >
              Request
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
  console.log("📞 requestCleaner called with cleanerUid:", cleanerUid);

   if (!user?.uid || userRole !== 'customer') {
    alert("Only customers can request cleaners.");
    return;
  }

  const requestRef = ref(database, `requests/${cleanerUid}`);
  await set(requestRef, {
    from: user.uid,
    status: 'pending',
    timestamp: Date.now(),
  });

  console.log(`📩 Sent cleaning request from ${user.uid} to ${cleanerUid}`);

};

useEffect(() => {
  if (userRole !== 'cleaner' || !user?.uid) return;

  const requestRef = ref(database, `requests/${user.uid}`);

  const unsubscribe = onValue(requestRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.status === 'pending') {
      setIncomingRequest(data);
    }
  });

  return () => unsubscribe();
}, [user?.uid, userRole]);

// ✅ Cleaner accepts request
const acceptRequest = async () => {
  try {
    const reqRef = ref(database, `requests/${user.uid}`);
    await set(reqRef, { ...incomingRequest, status: 'accepted' });

    const locRef = ref(database, `locations/${deviceId}`);
    await set(locRef, {
      ...currentCoords,
      role: userRole,
      name: userName,
      uid: auth.currentUser?.uid || null,
      isAvailable: false, // ✅ step 3: auto go offline after accepting
      timestamp: Date.now(),
      lat: currentCoords?.lat,
      lng: currentCoords?.lng,
    });

    // ✅ step 2: Create booking record in Firestore
    const bookingRef = collection(db, 'bookings');
    await addDoc(bookingRef, {
      cleanerUid: user.uid,
      customerUid: incomingRequest.from,
      status: 'accepted',
      createdAt: serverTimestamp(),
    });
    console.log("📘 Booking created in Firestore.");

    // ✅ optional visual feedback
    alert("🧹 Request accepted! Booking recorded.");

    setIncomingRequest(null);
  } catch (err) {
    console.error("❌ Error accepting request:", err);
  }
};

// ✅ Customer feedback listener
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

      // ✅ popup notification instead of alert
      if (Notification.permission === 'granted') {
        if (latest.status === 'accepted') {
          new Notification("✅ Cleaner Accepted", {
            body: "Your cleaner is on the way!",
          });
        } else if (latest.status === 'rejected') {
          new Notification("❌ Cleaner Rejected", {
            body: "Cleaner declined your request. Try another one.",
          });
        }
      } else {
        // fallback alert if permission not granted
        if (latest.status === 'accepted') {
          alert("✅ Your request was accepted! Cleaner is on the way.");
        } else if (latest.status === 'rejected') {
          alert("❌ Your request was rejected. Try another cleaner.");
        }
      }
    }
  });

  // ✅ keep unsubscribe for cleanup
  return () => {
    unsubscribe();
    console.log("🧹 Customer request listener unsubscribed.");
  };
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


// const handleTrackCustomer = () => {
//   console.log("🔍 Incoming request from UID:", incomingRequest?.from);


//   if (!incomingRequest?.from || !allLocations) return;

//   const customerEntry = Object.entries(allLocations).find(
//     ([key, loc]) =>
//       key === incomingRequest.from || loc.uid === incomingRequest.from
//   );

//   if (customerEntry) {
//     const [, customerLoc] = customerEntry;
//     setTargetCoords({ lat: customerLoc.lat, lng: customerLoc.lng });
//     setRecenterTrigger((prev) => prev + 1);

//     console.log("📍 Tracking customer at:", customerLoc);
//   } else {
//     console.warn("⚠️ Could not find customer in allLocations:", incomingRequest.from);
//     alert("Customer location not found.");
//   }
// };

// const handleTrackCustomer = () => {
//   if (!incomingRequest?.from || !allLocations) return;

//   const customerLoc = Object.values(allLocations).find(
//     (loc) => loc.uid === incomingRequest.from
//   );

//   if (customerLoc) {
//     setTargetCoords({
//       lat: customerLoc.lat,
//       lng: customerLoc.lng,
//     });
//     setRecenterTrigger((prev) => prev + 1);

//     console.log("📍 Tracking customer at:", customerLoc);
//     console.log("🔍 Incoming request from UID:", incomingRequest?.from);

//   } else {
//     alert("Customer location not found.");
//   }
// };

const rejectRequest = async () => {
  const reqRef = ref(database, `requests/${user.uid}`);
  await set(reqRef, { ...incomingRequest, status: 'rejected' });

  setIncomingRequest(null);
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

            {/* Incoming Cleaner Request */}
            {incomingRequest && (
              <div className="notification request-notification">
                <strong> New Cleaning Request</strong>
                <p>Someone needs your services.</p>
                <div>
                  <button onClick={handleTrackCustomer} className="btn btn-info">Track Customer</button>
                  <button onClick={acceptRequest} className="btn btn-success">Accept</button>
                  <button onClick={rejectRequest} className="btn btn-danger">Reject</button>
                </div>
              </div>
            )}

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
            <div className="modal-backdrop">
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
                    <Popup>
                      {renderPopupContent(loc)} {/* ✅ OK */}
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
                      if (deviceId) {
                        await remove(ref(database, `locations/${deviceId}`));
                        console.log(`🗑️ Removed location for ${deviceId}`);
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

              {userRole === 'cleaner' && (
                <div className="availability-toggle">
                  <div className="toggle-row">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={isAvailable}
                        onChange={toggleAvailability}
                      />
                      <span className="slider"></span>
                    </label>
                    <span className={`status-text ${isAvailable ? 'online' : 'offline'}`}>
                      {isAvailable ? ' Online' : ' Offline'}
                    </span>
                  </div>
                </div>
              )}

              <div className="info-section">
                {selectedRole === 'viewer' && (
                  <p>You are viewing the map as a guest. No location access needed.</p>
                )}

                {selectedRole && selectedRole !== 'viewer' && currentCoords && (
                  <p><strong>Your location:</strong> {currentCoords.lat}, {currentCoords.lng}</p>
                )}
              </div>
            
          </div>
                
          </div>

          


      {/* {incomingMessage && (
        <div style={{
          zIndex: 1000,
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '1rem',
          zIndex: 1000,
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          <strong>📨 New message</strong>
          <p>{incomingMessage.text}</p>
          <button
            onClick={() => {
              setChatWith(incomingMessage.senderId);
              setIncomingMessage(null);
            }}
          >
            Open Chat
          </button>
        </div>
      )}

      {incomingRequest && (
        <div className="modal">
          <h3>New Request</h3>
          <p>Customer is requesting your help</p>
          <button onClick={acceptRequest}>Accept</button>
          <button onClick={rejectRequest}>Reject</button>
        </div>
      )} */}

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


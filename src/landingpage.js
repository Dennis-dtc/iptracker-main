import React from "react";
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
  const openDashboardModal = () => setShowDashboardModal(true);

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
                <div className="flex gap-2 py-2">
                  <button
                    className="ml-2 px-3 py-2 bg-orange-500 border rounded"
                    onClick={openDashboardModal}
                  >
                    View  Dashboard Modal
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
            <h3 className="font-semibold">Payment (Demo)</h3>
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

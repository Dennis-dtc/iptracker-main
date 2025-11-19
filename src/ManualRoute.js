// ManualRoute.js
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import './App.css';

function ManualRoute({ from, to }) {
  const map = useMap();

  useEffect(() => {
    if (!from || !to) return;

    const apiKey = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImY5ODMzM2YwNjA1ZTRmYTlhODE3NDBmMDg5YTVjODc2IiwiaCI6Im11cm11cjY0In0='; // Replace with your OpenRouteService API key
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

    const body = {
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat]
      ]
    };

    let polyline; // to keep reference for cleanup
    let distanceTooltip;

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify(body)
    })
      .then(res => res.json())
      .then(data => {
        const coords = data.features[0].geometry.coordinates;
        const latLngs = coords.map(([lng, lat]) => [lat, lng]);

        polyline = L.polyline(latLngs, {
          color: 'blue',
          weight: 4
        }).addTo(map);

        map.fitBounds(polyline.getBounds());

        // 📏 Optional: Log or display distance
        const distanceInKm = (data.features[0].properties.summary.distance / 1000).toFixed(2);
        console.log(`📏 Distance: ${distanceInKm} km`);

        const midIndex = Math.floor(latLngs.length / 2);
        const midpoint = latLngs[midIndex];

        distanceTooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'distance-tooltip',
          offset: [0, 0]
        })
        .setContent(`📏 ${distanceInKm} km`)
        .setLatLng(midpoint)
        .addTo(map);
      })
      .catch(err => {
        console.error('Error fetching route:', err);
      });

    return () => {
      if (polyline) {
        map.removeLayer(polyline);
      }
    };
  }, [from, to, map]);

  return null;
}

export default ManualRoute;




// // ManualRoute.js
// import { useEffect } from 'react';
// import { useMap } from 'react-leaflet';
// import L from 'leaflet';

// function ManualRoute({ from, to }) {
//   const map = useMap();

//   useEffect(() => {
//     if (!from || !to) return;

//     const apiKey = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImY5ODMzM2YwNjA1ZTRmYTlhODE3NDBmMDg5YTVjODc2IiwiaCI6Im11cm11cjY0In0='; // Replace with your OpenRouteService API key

//     const url = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

//     const body = {
//       coordinates: [
//         [from.lng, from.lat],
//         [to.lng, to.lat]
//       ]
//     };

//     fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': apiKey
//       },
//       body: JSON.stringify(body)
//     })
//     .then(res => res.json())
//     .then(data => {
//       const coords = data.features[0].geometry.coordinates;
//       const latLngs = coords.map(([lng, lat]) => [lat, lng]);

//       const polyline = L.polyline(latLngs, {
//         color: 'blue',
//         weight: 4
//       }).addTo(map);

//       map.fitBounds(polyline.getBounds());

//       return () => {
//         map.removeLayer(polyline);
//       };
//     })
//     .catch(err => {
//       console.error('Error fetching route:', err);
//     });

//   }, [from, to, map]);

//   return null;
// }

// export default ManualRoute;

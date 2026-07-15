// Bearing (degrees from north) and range (km) of a drone relative to the hub.

export function bearingFrom(center, d) {
  const angle = (Math.atan2(d.lng - center.lng, d.lat - center.lat) * 180) / Math.PI;
  return Math.round((angle + 360) % 360);
}

export function rangeKm(center, d) {
  const dLat = (d.lat - center.lat) * 111;
  const dLng = (d.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export const STATUS_CODE = {
  active: 'AUTH',
  idle: 'IDLE',
  returning: 'RTB',
  charging: 'CHRG'
};

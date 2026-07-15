// 5 predefined datasets. Each dataset has a map center, a zoom span (degrees),
// and a set of companies with drone fleets that the simulator spawns on load.

export const DATASETS = [
  {
    id: 'sf-delivery',
    name: 'San Francisco — Delivery Ops',
    description: 'Last-mile package delivery fleets over the SF Bay Area',
    center: { lat: 37.7749, lng: -122.4194 },
    span: 0.18,
    companies: [
      { name: 'SwiftParcel', industry: 'Delivery', color: '#4fc3f7', drones: 6 },
      { name: 'BayDrop Logistics', industry: 'Delivery', color: '#81c784', drones: 5 },
      { name: 'GoldenGate Air', industry: 'Courier', color: '#ffb74d', drones: 4 }
    ]
  },
  {
    id: 'ny-emergency',
    name: 'New York — Emergency Response',
    description: 'Medical supply and first-responder support drones over NYC',
    center: { lat: 40.7128, lng: -74.006 },
    span: 0.2,
    companies: [
      { name: 'MedEvac Air', industry: 'Medical', color: '#e57373', drones: 5 },
      { name: 'CityWatch Response', industry: 'Public Safety', color: '#64b5f6', drones: 6 },
      { name: 'RapidAid NYC', industry: 'Medical', color: '#f06292', drones: 3 }
    ]
  },
  {
    id: 'london-security',
    name: 'London — Security Patrol',
    description: 'Perimeter and event security surveillance fleets over London',
    center: { lat: 51.5074, lng: -0.1278 },
    span: 0.16,
    companies: [
      { name: 'Sentinel UK', industry: 'Security', color: '#9575cd', drones: 6 },
      { name: 'ThamesGuard', industry: 'Security', color: '#4db6ac', drones: 4 },
      { name: 'SkyEye Events', industry: 'Surveillance', color: '#dce775', drones: 4 }
    ]
  },
  {
    id: 'tokyo-logistics',
    name: 'Tokyo — Warehouse Logistics',
    description: 'Inter-warehouse inventory transfer network across Tokyo',
    center: { lat: 35.6762, lng: 139.6503 },
    span: 0.22,
    companies: [
      { name: 'Kanto Cargo', industry: 'Logistics', color: '#ff8a65', drones: 7 },
      { name: 'Shibuya Express', industry: 'Delivery', color: '#4fc3f7', drones: 5 },
      { name: 'Nippon AirFreight', industry: 'Freight', color: '#aed581', drones: 5 }
    ]
  },
  {
    id: 'mumbai-survey',
    name: 'Mumbai — Agri & Land Survey',
    description: 'Agricultural monitoring and land-survey missions around Mumbai',
    center: { lat: 19.076, lng: 72.8777 },
    span: 0.24,
    companies: [
      { name: 'AgroScan India', industry: 'Agriculture', color: '#81c784', drones: 6 },
      { name: 'GeoMap Surveys', industry: 'Surveying', color: '#ffd54f', drones: 4 },
      { name: 'Konkan AirData', industry: 'Mapping', color: '#4dd0e1', drones: 4 }
    ]
  }
];

export function getDataset(id) {
  return DATASETS.find((d) => d.id === id) || null;
}

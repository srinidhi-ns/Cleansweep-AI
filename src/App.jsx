import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapPin, Truck, Camera, ShieldAlert, CheckCircle2, AlertTriangle,
  Clock, Upload, RefreshCw, Settings, Database, FileCode, Copy,
  Download, Bus, Navigation, Search, Eye, Check, X, Sparkles,
  Activity, Flame, Award, Phone, Mail, FileText, Send, Play, Pause,
  Crosshair, Layers, ArrowRight, Trash2, Zap, Info, ExternalLink,
  ChevronRight, Radio, Filter, UserCheck, Scale, Palette, Sun, Moon
} from 'lucide-react';

// ============================================================================
// 1. SUPABASE SQL SCHEMA & SEED DATA (FOR MODAL & DIRECT DOWNLOAD)
// ============================================================================
const SUPABASE_SQL_SCHEMA = `-- CleanSweep AI: Automated Dumpsite Detection, Dynamic Municipal Dispatch & Civic Enforcement
-- Localized for Bengaluru, Karnataka, India (BBMP, BMTC & Karnataka RTO)
-- Aligned with UN SDG 11: Sustainable Cities & Communities

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BBMP Cleanup Trucks Table
CREATE TABLE IF NOT EXISTS cleanup_trucks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  truck_number TEXT UNIQUE NOT NULL,
  bbmp_zone TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  current_lat DOUBLE PRECISION NOT NULL,
  current_lng DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'en_route', 'cleaning', 'maintenance')),
  capacity_kg INT DEFAULT 2500,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Karnataka RTO Vehicle Registry Table (Mock Lookup for ANPR)
CREATE TABLE IF NOT EXISTS vehicle_registry (
  license_plate TEXT PRIMARY KEY,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  rto_zone TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  prior_offenses_count INT DEFAULT 0
);

-- 3. Waste Reports & < 2-Hour SLA Table
CREATE TABLE IF NOT EXISTS waste_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL CHECK (source_type IN ('citizen_upload', 'bmtc_bus_camera', 'bbmp_truck_camera')),
  source_identifier TEXT,
  image_url TEXT NOT NULL,
  after_image_url TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  ward_name TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  ai_confidence NUMERIC DEFAULT 0.95,
  waste_category TEXT,
  severity TEXT DEFAULT 'Medium' CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  estimated_volume_kg INT DEFAULT 50,
  ai_summary TEXT,
  detected_plate TEXT,
  status TEXT DEFAULT 'verified' CHECK (status IN ('pending_verification', 'verified', 'dispatched', 'cleaned', 'rejected')),
  assigned_truck_id UUID REFERENCES cleanup_trucks(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sla_deadline TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours'),
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  cleaned_at TIMESTAMPTZ,
  resolution_minutes INT
);

-- 4. Automated E-Challans / Fines Table
CREATE TABLE IF NOT EXISTS fines_challans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challan_number TEXT UNIQUE NOT NULL,
  report_id UUID REFERENCES waste_reports(id) ON DELETE CASCADE,
  license_plate TEXT REFERENCES vehicle_registry(license_plate),
  owner_name TEXT NOT NULL,
  fine_amount NUMERIC DEFAULT 2500.00,
  evidence_image_url TEXT,
  ward_name TEXT,
  violation_lat DOUBLE PRECISION,
  violation_lng DOUBLE PRECISION,
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'sms_sent', 'paid', 'disputed')),
  issued_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bengaluru Black-Spot Hotspots Table
CREATE TABLE IF NOT EXISTS hotspots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ward_name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  incident_count INT DEFAULT 1,
  last_incident_at TIMESTAMPTZ DEFAULT NOW(),
  recommended_action TEXT DEFAULT 'Normal Monitoring'
);

-- Enable Row Level Security (Permissive for Hackathon Demo)
ALTER TABLE cleanup_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fines_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotspots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Demo Access cleanup_trucks" ON cleanup_trucks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Demo Access vehicle_registry" ON vehicle_registry FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Demo Access waste_reports" ON waste_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Demo Access fines_challans" ON fines_challans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Demo Access hotspots" ON hotspots FOR ALL USING (true) WITH CHECK (true);

-- Seed Bengaluru BBMP Trucks
INSERT INTO cleanup_trucks (truck_number, bbmp_zone, driver_name, driver_phone, current_lat, current_lng, status, capacity_kg) VALUES
('KA-01-G-4401', 'BBMP South (Banashankari / PESU)', 'Ramesh Gowda', '+91 98450 11223', 12.9360, 77.5380, 'available', 3000),
('KA-01-G-4402', 'BBMP South-East (Koramangala)', 'Manjunath S', '+91 98450 22334', 12.9380, 77.6260, 'available', 2500),
('KA-03-G-1109', 'BBMP East (Indiranagar)', 'Venkatesh R', '+91 98450 33445', 12.9790, 77.6420, 'en_route', 3000),
('KA-53-G-8821', 'BBMP Mahadevapura (Whitefield)', 'Shivu Kumar', '+91 98450 44556', 12.9840, 77.7340, 'available', 4000),
('KA-02-G-5510', 'BBMP West (Majestic / Malleshwaram)', 'Prakash B', '+91 98450 55667', 12.9660, 77.5740, 'available', 2500)
ON CONFLICT (truck_number) DO NOTHING;

-- Seed Karnataka RTO Vehicle Registry
INSERT INTO vehicle_registry (license_plate, owner_name, owner_phone, owner_email, rto_zone, vehicle_type, vehicle_model, prior_offenses_count) VALUES
('KA01MJ2026', 'Suresh Babu N', '+91 99001 12233', 'suresh.b@example.com', 'KA-01 Koramangala RTO', 'Light Goods Vehicle', 'Tata Ace Gold', 1),
('KA05ND4411', 'harish_logistics_pvt', '+91 99002 23344', 'dispatch@harishlogistics.in', 'KA-05 Jayanagar RTO', 'Mini Tipper', 'Mahindra Bolero Pik-Up', 2),
('KA51AB9090', 'Naveen Reddy', '+91 99003 34455', 'naveen.r@example.com', 'KA-51 Electronic City RTO', 'Three-Wheeler Goods', 'Piaggio Ape Xtra', 0),
('KA03HA7788', 'Kiran Enterprises', '+91 99004 45566', 'kiran.ent@example.com', 'KA-03 Indiranagar RTO', 'Commercial Van', 'Maruti Super Carry', 0),
('KA04MM1122', 'Devaraj Transports', '+91 99005 56677', 'devaraj@example.com', 'KA-04 Yeshwanthpur RTO', 'Light Goods Vehicle', 'Ashok Leyland Dost', 3)
ON CONFLICT (license_plate) DO NOTHING;

-- Seed Bengaluru Black-Spot Hotspots
INSERT INTO hotspots (ward_name, center_lat, center_lng, incident_count, recommended_action) VALUES
('Ward 163 - Banashankari Outer Ring Road', 12.9345, 77.5345, 4, 'Deploy BBMP Marshals for Night Patrol'),
('Ward 151 - Koramangala 5th Block', 12.9352, 77.6245, 6, 'Install Permanent Smart Bin & CCTV'),
('Ward 80 - Hoysala Nagar (Indiranagar)', 12.9784, 77.6408, 2, 'Normal Monitoring'),
('Ward 85 - Doddanekundi / Whitefield Main Rd', 12.9850, 77.7369, 5, 'Install Permanent Smart Bin & CCTV');
`;

// ============================================================================
// 2. BENGALURU PRESET LOCATIONS, CAMERAS & EVIDENCE GENERATOR
// ============================================================================
const BENGALURU_CENTER = [12.9716, 77.5946];

const BENGALURU_LOCATIONS = [
  {
    id: 'loc-pesu',
    name: 'PES University / Ring Road (Banashankari)',
    ward: 'Ward 163 - Banashankari Outer Ring Road',
    lat: 12.9345,
    lng: 77.5345,
    zone: 'BBMP South'
  },
  {
    id: 'loc-koramangala',
    name: 'Koramangala 80 Feet Road',
    ward: 'Ward 151 - Koramangala 5th Block',
    lat: 12.9352,
    lng: 77.6245,
    zone: 'BBMP South-East'
  },
  {
    id: 'loc-indiranagar',
    name: 'Indiranagar 100 Feet Road',
    ward: 'Ward 80 - Hoysala Nagar (Indiranagar)',
    lat: 12.9784,
    lng: 77.6408,
    zone: 'BBMP East'
  },
  {
    id: 'loc-whitefield',
    name: 'Whitefield ITPL Main Road',
    ward: 'Ward 85 - Doddanekundi / Whitefield Main Rd',
    lat: 12.9850,
    lng: 77.7369,
    zone: 'BBMP Mahadevapura'
  },
  {
    id: 'loc-majestic',
    name: 'KR Market / Majestic Junction',
    ward: 'Ward 139 - KR Market / Chickpet',
    lat: 12.9634,
    lng: 77.5755,
    zone: 'BBMP West'
  },
  {
    id: 'loc-jayanagar',
    name: 'Jayanagar 4th Block',
    ward: 'Ward 168 - Jayanagar Pattabhiram Nagar',
    lat: 12.9299,
    lng: 77.5824,
    zone: 'BBMP South'
  }
];

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Curated, verified real-world urban street waste, Indian roadside dumpsites, and cleaned road photography for all 5 locations (no beaches or seas)
const REAL_WASTE_PHOTOS = {
  // 1. PES University / Banashankari Ring Rd (Actual Bangalore street garbage pile — ready for live upload during presentation)
  pesuDump: 'https://commons.wikimedia.org/wiki/Special:FilePath/Garbage_Bangalore.jpg?width=1000',
  // 2. Koramangala 80 Feet Road (Indian roadside garbage & commercial waste dump)
  koramangalaDump: 'https://commons.wikimedia.org/wiki/Special:FilePath/Garbej_dump_on_the_Delhi_-_Karnal_Road_03.jpg?width=1000',
  // 3. Indiranagar 100 Feet Road (Urban street garbage heap on pavement)
  indiranagarPlastic: 'https://commons.wikimedia.org/wiki/Special:FilePath/Street_Garbage.jpg?width=1000',
  // 4. Whitefield ITPL Main Road (Roadside open garbage & plastic litter dump)
  whitefieldWetland: 'https://commons.wikimedia.org/wiki/Special:FilePath/Garbage_on_a_roadside.JPG?width=1000',
  // 5. KR Market / Majestic (Overflowing Indian street garbage dump at collection point)
  majesticMarket: 'https://commons.wikimedia.org/wiki/Special:FilePath/India_-_Sights_%26_Culture_-_Common_garbage_dump_outside_a_temple_(2566331277).jpg?width=1000',
  // Cleaned urban road verification photo
  cleanedStreet: 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=1000&q=80',
  fallback: 'https://commons.wikimedia.org/wiki/Special:FilePath/Garbage_Bangalore.jpg?width=1000'
};

function createStreetEvidenceDataUrl({
  plate,
  isCleaned = false,
  photoUrl
}) {
  if (isCleaned) return REAL_WASTE_PHOTOS.cleanedStreet;
  if (photoUrl) return photoUrl;
  if (plate === 'KA01MJ2026') return REAL_WASTE_PHOTOS.pesuDump;
  if (plate === 'KA05ND4411') return REAL_WASTE_PHOTOS.koramangalaDump;
  return REAL_WASTE_PHOTOS.fallback;
}

// 5 Preset Scenarios across Bengaluru with real-world street waste photographs
const PRESET_SCENARIOS = [
  {
    id: 'scen-1',
    title: 'PES University / Ring Rd — Active Roadside Dumping',
    locationId: 'loc-pesu',
    wasteCategory: 'Mixed Municipal Solid Waste / Construction Debris / Plastic',
    severity: 'High',
    estimatedVolumeKg: 180,
    violatorDetected: true,
    licensePlate: 'KA01MJ2026',
    vehicleName: 'Tata Ace Gold',
    photoUrl: REAL_WASTE_PHOTOS.pesuDump,
    confidenceScore: 0.96,
    aiSummary: 'Large accumulation of unsegregated plastic waste and debris near footpath; commercial goods vehicle KA01MJ2026 actively dumping waste.'
  },
  {
    id: 'scen-2',
    title: 'Koramangala 80 Ft Rd — Commercial Tipper Debris Dump',
    locationId: 'loc-koramangala',
    wasteCategory: 'Construction & Demolition (C&D) Rubble + Bulk Packaging',
    severity: 'Critical',
    estimatedVolumeKg: 420,
    violatorDetected: true,
    licensePlate: 'KA05ND4411',
    vehicleName: 'Mahindra Bolero Pik-Up',
    photoUrl: REAL_WASTE_PHOTOS.koramangalaDump,
    confidenceScore: 0.98,
    aiSummary: 'Critical black-spot blockage on Koramangala 80 Feet Road footpath; Mahindra Bolero Pik-Up (KA05ND4411) captured offloading C&D rubble.'
  },
  {
    id: 'scen-3',
    title: 'Indiranagar 100 Ft Rd — Plastic Bottles & Packaging Pile',
    locationId: 'loc-indiranagar',
    wasteCategory: 'Single-Use Plastic Bottles & Discarded Packaging',
    severity: 'Medium',
    estimatedVolumeKg: 95,
    violatorDetected: false,
    licensePlate: null,
    vehicleName: null,
    photoUrl: REAL_WASTE_PHOTOS.indiranagarPlastic,
    confidenceScore: 0.94,
    aiSummary: 'Accumulation of crushed plastic bottles, containers, and discarded packaging scattered along roadside shoulder on Indiranagar 100ft Road.'
  },
  {
    id: 'scen-4',
    title: 'Whitefield ITPL Main Rd — Open Corridor Refuse Dump',
    locationId: 'loc-whitefield',
    wasteCategory: 'Unsegregated Municipal Waste & Polybags',
    severity: 'High',
    estimatedVolumeKg: 340,
    violatorDetected: false,
    licensePlate: null,
    vehicleName: null,
    photoUrl: REAL_WASTE_PHOTOS.whitefieldWetland,
    confidenceScore: 0.96,
    aiSummary: 'High-volume refuse dumping near ITPL corridor and storm-water boundary; severe litter accumulation requiring immediate BBMP compactor deployment.'
  },
  {
    id: 'scen-5',
    title: 'KR Market / Majestic — Wholesale Market Garbage Heap',
    locationId: 'loc-majestic',
    wasteCategory: 'Wholesale Market Organic Waste & Commercial Sacks',
    severity: 'Critical',
    estimatedVolumeKg: 580,
    violatorDetected: false,
    licensePlate: null,
    vehicleName: null,
    photoUrl: REAL_WASTE_PHOTOS.majesticMarket,
    confidenceScore: 0.98,
    aiSummary: 'Critical market-side overflow of organic produce refuse and commercial packaging sacks blocking pedestrian thoroughfares near KR Market junction.'
  }
];

// BMTC Vajra / Astra Bus Fleet Routes for Simulator Tab
const BMTC_ROUTES = [
  {
    id: 'bmtc-500d',
    routeCode: 'Route 500D (Vajra AC)',
    corridor: 'Silk Board ↔ Marathahalli ↔ Hebbal (Outer Ring Rd)',
    busNumber: 'KA-57-F-2041',
    cameraModel: 'BMTC-AI-EdgeCam v3.2',
    currentLat: 12.9352,
    currentLng: 77.6245,
    speedKmh: 28,
    linkedScenarioIndex: 1
  },
  {
    id: 'bmtc-401k',
    routeCode: 'Route 401K (Non-AC High Freq)',
    corridor: 'Kengeri ↔ PES University / Banashankari ↔ Yelahanka',
    busNumber: 'KA-57-F-1189',
    cameraModel: 'BMTC-AI-EdgeCam v3.2',
    currentLat: 12.9345,
    currentLng: 77.5345,
    speedKmh: 34,
    linkedScenarioIndex: 0
  },
  {
    id: 'bmtc-335e',
    routeCode: 'Route 335E (Vajra Electric)',
    corridor: 'Majestic ↔ Indiranagar ↔ Whitefield ITPL',
    busNumber: 'KA-57-EV-0892',
    cameraModel: 'BMTC-AI-EdgeCam v4.0',
    currentLat: 12.9850,
    currentLng: 77.7369,
    speedKmh: 24,
    linkedScenarioIndex: 3
  },
  {
    id: 'bmtc-201r',
    routeCode: 'Route 201R (Suburban Link)',
    corridor: 'Banashankari ↔ Jayanagar 4th Blk ↔ Indiranagar',
    busNumber: 'KA-57-F-3310',
    cameraModel: 'BMTC-AI-EdgeCam v3.2',
    currentLat: 12.9784,
    currentLng: 77.6408,
    speedKmh: 31,
    linkedScenarioIndex: 2
  }
];

// ============================================================================
// 3. INITIAL SEED DATA (MATCHING SUPABASE SQL SCHEMA)
// ============================================================================
const INITIAL_TRUCKS = [
  {
    id: 'truck-1',
    truck_number: 'KA-01-G-4401',
    bbmp_zone: 'BBMP South (Banashankari / PESU)',
    driver_name: 'Ramesh Gowda',
    driver_phone: '+91 98450 11223',
    current_lat: 12.9360,
    current_lng: 77.5380,
    status: 'available',
    capacity_kg: 3000
  },
  {
    id: 'truck-2',
    truck_number: 'KA-01-G-4402',
    bbmp_zone: 'BBMP South-East (Koramangala)',
    driver_name: 'Manjunath S',
    driver_phone: '+91 98450 22334',
    current_lat: 12.9380,
    current_lng: 77.6260,
    status: 'available',
    capacity_kg: 2500
  },
  {
    id: 'truck-3',
    truck_number: 'KA-03-G-1109',
    bbmp_zone: 'BBMP East (Indiranagar)',
    driver_name: 'Venkatesh R',
    driver_phone: '+91 98450 33445',
    current_lat: 12.9790,
    current_lng: 77.6420,
    status: 'en_route',
    capacity_kg: 3000
  },
  {
    id: 'truck-4',
    truck_number: 'KA-53-G-8821',
    bbmp_zone: 'BBMP Mahadevapura (Whitefield)',
    driver_name: 'Shivu Kumar',
    driver_phone: '+91 98450 44556',
    current_lat: 12.9840,
    current_lng: 77.7340,
    status: 'en_route',
    capacity_kg: 4000
  },
  {
    id: 'truck-5',
    truck_number: 'KA-02-G-5510',
    bbmp_zone: 'BBMP West (Majestic / Malleshwaram)',
    driver_name: 'Prakash B',
    driver_phone: '+91 98450 55667',
    current_lat: 12.9660,
    current_lng: 77.5740,
    status: 'available',
    capacity_kg: 2500
  }
];

const INITIAL_VEHICLE_REGISTRY = [
  {
    license_plate: 'KA01MJ2026',
    owner_name: 'Suresh Babu N',
    owner_phone: '+91 99001 12233',
    owner_email: 'suresh.b@example.com',
    rto_zone: 'KA-01 Koramangala RTO',
    vehicle_type: 'Light Goods Vehicle',
    vehicle_model: 'Tata Ace Gold',
    prior_offenses_count: 1
  },
  {
    license_plate: 'KA05ND4411',
    owner_name: 'harish_logistics_pvt',
    owner_phone: '+91 99002 23344',
    owner_email: 'dispatch@harishlogistics.in',
    rto_zone: 'KA-05 Jayanagar RTO',
    vehicle_type: 'Mini Tipper',
    vehicle_model: 'Mahindra Bolero Pik-Up',
    prior_offenses_count: 2
  },
  {
    license_plate: 'KA51AB9090',
    owner_name: 'Naveen Reddy',
    owner_phone: '+91 99003 34455',
    owner_email: 'naveen.r@example.com',
    rto_zone: 'KA-51 Electronic City RTO',
    vehicle_type: 'Three-Wheeler Goods',
    vehicle_model: 'Piaggio Ape Xtra',
    prior_offenses_count: 0
  },
  {
    license_plate: 'KA03HA7788',
    owner_name: 'Kiran Enterprises',
    owner_phone: '+91 99004 45566',
    owner_email: 'kiran.ent@example.com',
    rto_zone: 'KA-03 Indiranagar RTO',
    vehicle_type: 'Commercial Van',
    vehicle_model: 'Maruti Super Carry',
    prior_offenses_count: 0
  },
  {
    license_plate: 'KA04MM1122',
    owner_name: 'Devaraj Transports',
    owner_phone: '+91 99005 56677',
    owner_email: 'devaraj@example.com',
    rto_zone: 'KA-04 Yeshwanthpur RTO',
    vehicle_type: 'Light Goods Vehicle',
    vehicle_model: 'Ashok Leyland Dost',
    prior_offenses_count: 3
  }
];

const INITIAL_HOTSPOTS = [
  {
    id: 'hs-2',
    ward_name: 'Ward 151 - Koramangala 5th Block',
    center_lat: 12.9352,
    center_lng: 77.6245,
    incident_count: 6,
    last_incident_at: new Date(Date.now() - 45 * 60000).toISOString(),
    recommended_action: 'Install Permanent Smart Bin & AI CCTV'
  },
  {
    id: 'hs-3',
    ward_name: 'Ward 80 - Hoysala Nagar (Indiranagar)',
    center_lat: 12.9784,
    center_lng: 77.6408,
    incident_count: 2,
    last_incident_at: new Date(Date.now() - 95 * 60000).toISOString(),
    recommended_action: 'Normal Monitoring'
  },
  {
    id: 'hs-4',
    ward_name: 'Ward 85 - Doddanekundi / Whitefield Main Rd',
    center_lat: 12.9850,
    center_lng: 77.7369,
    incident_count: 5,
    last_incident_at: new Date(Date.now() - 120 * 60000).toISOString(),
    recommended_action: 'Install Permanent Smart Bin & AI CCTV'
  },
  {
    id: 'hs-5',
    ward_name: 'Ward 139 - KR Market / Chickpet',
    center_lat: 12.9634,
    center_lng: 77.5755,
    incident_count: 4,
    last_incident_at: new Date(Date.now() - 30 * 60000).toISOString(),
    recommended_action: 'Deploy BBMP Marshals for Night Patrol'
  }
];

function createInitialReports() {
  const now = Date.now();
  return [
    {
      id: 'rep-102',
      source_type: 'citizen_upload',
      source_identifier: 'Citizen @IndiranagarResident',
      image_url: createStreetEvidenceDataUrl({
        title: 'Indiranagar 100 Feet Road',
        ward: 'Ward 80 - Hoysala Nagar (Indiranagar)',
        plate: null,
        wasteType: 'Single-Use Plastic Bottles & Packaging (95 kg)',
        severity: 'Medium',
        sourceTag: 'CITIZEN UPLOAD',
        photoUrl: REAL_WASTE_PHOTOS.indiranagarPlastic
      }),
      after_image_url: null,
      lat: 12.9784,
      lng: 77.6408,
      ward_name: 'Ward 80 - Hoysala Nagar (Indiranagar)',
      is_verified: true,
      ai_confidence: 0.94,
      waste_category: 'Single-Use Plastic Bottles & Discarded Packaging',
      severity: 'Medium',
      estimated_volume_kg: 95,
      ai_summary: 'Roadside black-spot waste pile beside stormwater drain on Indiranagar 100ft Road. Dispatched nearest BBMP East compactor.',
      detected_plate: null,
      status: 'dispatched',
      assigned_truck_id: 'truck-3',
      assigned_truck_number: 'KA-03-G-1109',
      dispatch_distance_km: 0.15,
      created_at: new Date(now - 24 * 60000).toISOString(),
      sla_deadline: new Date(now + 96 * 60000).toISOString(), // 1h 36m left
      dispatched_at: new Date(now - 23 * 60000).toISOString(),
      cleaned_at: null,
      resolution_minutes: null
    },
    {
      id: 'rep-104',
      source_type: 'bmtc_bus_camera',
      source_identifier: 'BMTC Route 335E (KA-57-EV-0892)',
      image_url: createStreetEvidenceDataUrl({
        title: 'Whitefield ITPL Main Road',
        ward: 'Ward 85 - Doddanekundi / Whitefield Main Rd',
        plate: null,
        wasteType: 'Unsegregated Municipal Waste & Polybags (340 kg)',
        severity: 'High',
        sourceTag: 'BMTC BUS 335E CAM',
        photoUrl: REAL_WASTE_PHOTOS.whitefieldWetland
      }),
      after_image_url: null,
      lat: 12.9850,
      lng: 77.7369,
      ward_name: 'Ward 85 - Doddanekundi / Whitefield Main Rd',
      is_verified: true,
      ai_confidence: 0.96,
      waste_category: 'Unsegregated Municipal Waste & Polybags',
      severity: 'High',
      estimated_volume_kg: 340,
      ai_summary: 'High-volume refuse dumping near ITPL corridor; BBMP Mahadevapura compactor KA-53-G-8821 dispatched.',
      detected_plate: null,
      status: 'dispatched',
      assigned_truck_id: 'truck-4',
      assigned_truck_number: 'KA-53-G-8821',
      dispatch_distance_km: 0.31,
      created_at: new Date(now - 52 * 60000).toISOString(),
      sla_deadline: new Date(now + 68 * 60000).toISOString(), // 1h 08m left
      dispatched_at: new Date(now - 51 * 60000).toISOString(),
      cleaned_at: null,
      resolution_minutes: null
    },
    {
      id: 'rep-103',
      source_type: 'bmtc_bus_camera',
      source_identifier: 'BMTC Route 500D (KA-57-F-2041)',
      image_url: createStreetEvidenceDataUrl({
        title: 'Koramangala 80 Feet Road',
        ward: 'Ward 151 - Koramangala 5th Block',
        plate: 'KA05ND4411',
        vehicleName: 'Bolero Pik-Up',
        wasteType: 'Construction Debris & Commercial Waste (420 kg)',
        severity: 'Critical',
        sourceTag: 'BMTC BUS 500D CAM',
        photoUrl: REAL_WASTE_PHOTOS.koramangalaDump
      }),
      after_image_url: createStreetEvidenceDataUrl({
        title: 'Koramangala 80 Feet Road (CLEANED)',
        ward: 'Ward 151 - Koramangala 5th Block',
        plate: null,
        wasteType: 'Spot Swept & Sanitized',
        severity: 'Low',
        isCleaned: true,
        sourceTag: 'BBMP CREW AFTER-PHOTO'
      }),
      lat: 12.9352,
      lng: 77.6245,
      ward_name: 'Ward 151 - Koramangala 5th Block',
      is_verified: true,
      ai_confidence: 0.98,
      waste_category: 'Construction & Demolition (C&D) Rubble + Bulk Packaging',
      severity: 'Critical',
      estimated_volume_kg: 420,
      ai_summary: 'Commercial mini-tipper KA05ND4411 caught dumping C&D rubble. Cleared by BBMP South-East crew in 38 mins.',
      detected_plate: 'KA05ND4411',
      status: 'cleaned',
      assigned_truck_id: 'truck-2',
      assigned_truck_number: 'KA-01-G-4402',
      dispatch_distance_km: 0.35,
      created_at: new Date(now - 110 * 60000).toISOString(),
      sla_deadline: new Date(now + 10 * 60000).toISOString(),
      dispatched_at: new Date(now - 109 * 60000).toISOString(),
      cleaned_at: new Date(now - 72 * 60000).toISOString(),
      resolution_minutes: 38
    }
  ];
}

function createInitialChallans() {
  const now = Date.now();
  return [
    {
      id: 'chal-2',
      challan_number: 'BBMP-SWM-2026-84891',
      report_id: 'rep-103',
      license_plate: 'KA05ND4411',
      owner_name: 'harish_logistics_pvt',
      owner_phone: '+91 99002 23344',
      owner_email: 'dispatch@harishlogistics.in',
      rto_zone: 'KA-05 Jayanagar RTO',
      vehicle_model: 'Mahindra Bolero Pik-Up (Mini Tipper)',
      fine_amount: 5000,
      prior_offenses: 2,
      evidence_image_url: createStreetEvidenceDataUrl({
        title: 'Koramangala 80 Feet Road',
        ward: 'Ward 151 - Koramangala 5th Block',
        plate: 'KA05ND4411',
        vehicleName: 'Bolero Pik-Up',
        wasteType: 'Construction Debris & Commercial Waste (420 kg)',
        severity: 'Critical',
        sourceTag: 'BMTC BUS 500D CAM',
        photoUrl: REAL_WASTE_PHOTOS.koramangalaDump
      }),
      ward_name: 'Ward 151 - Koramangala 5th Block',
      violation_lat: 12.9352,
      violation_lng: 77.6245,
      status: 'issued',
      issued_at: new Date(now - 109 * 60000).toISOString()
    }
  ];
}

// ============================================================================
// 4. HAVERSINE DISTANCE & HELPER FUNCTIONS
// ============================================================================
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function normalizeLicensePlate(rawPlate) {
  if (!rawPlate || typeof rawPlate !== 'string') return null;
  const cleaned = rawPlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return cleaned.length >= 6 ? cleaned : null;
}

function formatCountdown(deadlineIso, nowMs) {
  const diffSec = Math.floor((new Date(deadlineIso).getTime() - nowMs) / 1000);
  if (diffSec <= 0) {
    return { text: '00:00:00 (BREACHED)', expired: true, totalSec: 0, percent: 100 };
  }
  const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const secs = String(diffSec % 60).padStart(2, '0');
  const elapsedPercent = Math.min(100, Math.max(0, ((7200 - diffSec) / 7200) * 100));
  return {
    text: `${hrs}:${mins}:${secs}`,
    expired: false,
    totalSec: diffSec,
    percent: elapsedPercent
  };
}

// ============================================================================
// 5. INTERACTIVE BENGALURU LEAFLET / OPENSTREETMAP COMPONENT
// ============================================================================
const CARTO_API_KEY = 'cb1_4n7l_1_e02566b47a93d6245d7a8739';

function BengaluruLeafletMap({
  reports,
  trucks,
  hotspots,
  bmtcBuses,
  selectedReportId,
  onSelectReport,
  onPickLocation,
  pickMode = false
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const labelLayerRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [tileProvider, setTileProvider] = useState('google_streets'); // 'google_streets' | 'google_hybrid' | 'google_dark' | 'google_terrain'
  const [layersVisible, setLayersVisible] = useState({
    reports: true,
    trucks: true,
    hotspots: true,
    routes: true,
    buses: true
  });

  // Dynamically load Leaflet CSS & JS from CDN + Google Maps inspired styling
  useEffect(() => {
    const styleId = 'leaflet-google-maps-css';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .google-dark-tiles {
          filter: invert(92%) hue-rotate(180deg) brightness(96%) contrast(94%);
        }
        .leaflet-container {
          background-color: #e5e3df !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
          padding: 2px !important;
        }
        .leaflet-popup-tip {
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25) !important;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
          border-radius: 8px !important;
          overflow: hidden;
          margin-right: 12px !important;
          margin-bottom: 24px !important;
        }
        .leaflet-control-zoom a {
          background-color: #ffffff !important;
          color: #3c4043 !important;
          border-bottom: 1px solid #e8eaed !important;
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
          font-weight: 600 !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #f1f3f4 !important;
          color: #1a73e8 !important;
        }
      `;
      document.head.appendChild(style);
    }

    if (window.L) {
      setLeafletLoaded(true);
      return;
    }

    const cssId = 'leaflet-cdn-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const scriptId = 'leaflet-cdn-js';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      if (window.L) {
        setLeafletLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setLeafletLoaded(true));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => setLeafletLoaded(true);
    document.body.appendChild(script);
  }, []);

  // Initialize Map centered on Bengaluru with bottom-right zoom like Google Maps
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || mapInstanceRef.current) return;

    const L = window.L;
    const map = L.map(mapContainerRef.current, {
      center: BENGALURU_CENTER,
      zoom: 12,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    // Ensure proper map sizing once mounted
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletLoaded]);

  // Switch between Google Maps Standard Streets, Google Hybrid Satellite, Google Dark Mode, and Google Terrain
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current);
      labelLayerRef.current = null;
    }

    if (tileProvider === 'google_hybrid') {
      // Google Satellite + Roads Hybrid (lyrs=y)
      tileLayerRef.current = L.tileLayer(
        'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data &copy;2026 Google | BBMP Spatial Command'
        }
      ).addTo(map);
    } else if (tileProvider === 'google_terrain') {
      // Google Terrain + Streets (lyrs=p)
      tileLayerRef.current = L.tileLayer(
        'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data &copy;2026 Google | BBMP Spatial Command'
        }
      ).addTo(map);
    } else if (tileProvider === 'google_dark') {
      // Google Roadmap with Dark Command filter
      tileLayerRef.current = L.tileLayer(
        'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data &copy;2026 Google | BBMP Spatial Command',
          className: 'google-dark-tiles'
        }
      ).addTo(map);
    } else {
      // Default: Crisp, Authentic Google Maps Streets (lyrs=m)
      tileLayerRef.current = L.tileLayer(
        'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: 'Map data &copy;2026 Google | BBMP Spatial Command'
        }
      ).addTo(map);
    }
  }, [tileProvider, leafletLoaded]);

  // Handle Map Click for GPS selection
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const handleClick = (e) => {
      if (onPickLocation) {
        onPickLocation({
          lat: Number(e.latlng.lat.toFixed(4)),
          lng: Number(e.latlng.lng.toFixed(4))
        });
      }
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [leafletLoaded, onPickLocation]);

  // Render Markers, Hotspots & Dispatch Polylines
  useEffect(() => {
    if (!leafletLoaded || !mapInstanceRef.current || !layerGroupRef.current) return;
    const L = window.L;
    const group = layerGroupRef.current;
    group.clearLayers();

    // 1. Render 200m Black-Spot Hotspots
    if (layersVisible.hotspots) {
      hotspots.forEach((hs) => {
        const isSevere = hs.incident_count >= 5;
        const color = isSevere ? '#ef4444' : hs.incident_count >= 3 ? '#f59e0b' : '#38bdf8';

        L.circle([hs.center_lat, hs.center_lng], {
          radius: 450, // Visible 450m zone on city zoom
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.14,
          dashArray: '6, 6'
        })
          .bindPopup(
            `<div style="font-family:sans-serif;color:#0f172a;min-width:200px;">
              <div style="font-weight:800;color:#dc2626;font-size:12px;text-transform:uppercase;">🔥 Black-Spot Hotspot (${hs.incident_count} Incidents)</div>
              <div style="font-weight:700;font-size:13px;margin-top:2px;">${hs.ward_name}</div>
              <div style="margin-top:6px;padding:5px 8px;background:#fef2f2;border-left:3px solid #ef4444;font-size:11px;font-weight:600;">
                Marshal Action: ${hs.recommended_action}
              </div>
            </div>`
          )
          .addTo(group);
      });
    }

    // 2. Render Dispatch Route Polylines (Google Maps Navigation Blue/Green Style)
    if (layersVisible.routes) {
      reports
        .filter((r) => r.status !== 'cleaned' && r.assigned_truck_id)
        .forEach((rep) => {
          const truck = trucks.find((t) => t.id === rep.assigned_truck_id);
          if (truck) {
            // Outer casing for Google Maps route look
            L.polyline(
              [
                [truck.current_lat, truck.current_lng],
                [rep.lat, rep.lng]
              ],
              {
                color: '#1e3a8a',
                weight: 7,
                opacity: 0.45
              }
            ).addTo(group);

            const poly = L.polyline(
              [
                [truck.current_lat, truck.current_lng],
                [rep.lat, rep.lng]
              ],
              {
                color: '#1a73e8',
                weight: 4,
                dashArray: '8, 6',
                opacity: 1
              }
            ).addTo(group);

            poly.bindTooltip(
              `BBMP Dispatch: ${truck.truck_number} (${rep.dispatch_distance_km || calculateHaversineDistanceKm(truck.current_lat, truck.current_lng, rep.lat, rep.lng)} km)`,
              { sticky: true }
            );
          }
        });
    }

    // 3. Render BBMP Compactor Trucks
    if (layersVisible.trucks) {
      trucks.forEach((truck) => {
        const isAvailable = truck.status === 'available';
        const badgeColor = isAvailable ? '#10b981' : '#38bdf8';

        const truckIcon = L.divIcon({
          className: 'custom-bbmp-truck',
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
            <div style="background:#0f172a;border:2px solid ${badgeColor};color:#fff;padding:3px 7px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.6);">
              🚛 ${truck.truck_number}
            </div>
          </div>`,
          iconSize: [90, 26],
          iconAnchor: [45, 13]
        });

        L.marker([truck.current_lat, truck.current_lng], { icon: truckIcon })
          .bindPopup(
            `<div style="font-family:sans-serif;color:#0f172a;min-width:190px;">
              <div style="font-weight:800;color:#059669;font-size:12px;">🚛 BBMP SWM COMPACTOR</div>
              <div style="font-weight:700;font-size:14px;">${truck.truck_number}</div>
              <div style="font-size:11px;color:#475569;margin-top:2px;">${truck.bbmp_zone}</div>
              <div style="font-size:12px;margin-top:6px;"><strong>Driver:</strong> ${truck.driver_name} (${truck.driver_phone})</div>
              <div style="font-size:11px;margin-top:3px;"><strong>Status:</strong> <span style="text-transform:uppercase;font-weight:700;">${truck.status}</span> • Cap: ${truck.capacity_kg} kg</div>
            </div>`
          )
          .addTo(group);
      });
    }

    // 4. Render BMTC Vajra Camera Buses
    if (layersVisible.buses && bmtcBuses) {
      bmtcBuses.forEach((bus) => {
        const busIcon = L.divIcon({
          className: 'custom-bmtc-bus',
          html: `<div style="display:flex;align-items:center;transform:translate(-50%,-50%);">
            <div style="background:#1e3a8a;border:1.5px solid #60a5fa;color:#e0f2fe;padding:2px 6px;border-radius:6px;font-size:9px;font-weight:700;white-space:nowrap;">
              🚌 ${bus.routeCode.split(' ')[1]}
            </div>
          </div>`,
          iconSize: [70, 22],
          iconAnchor: [35, 11]
        });

        L.marker([bus.currentLat, bus.currentLng], { icon: busIcon })
          .bindPopup(
            `<div style="font-family:sans-serif;color:#0f172a;">
              <div style="font-weight:800;color:#1d4ed8;font-size:12px;">🚌 BMTC AI EDGE CAMERA</div>
              <div style="font-weight:700;font-size:13px;">${bus.routeCode} (${bus.busNumber})</div>
              <div style="font-size:11px;color:#475569;">${bus.corridor}</div>
            </div>`
          )
          .addTo(group);
      });
    }

    // 5. Render Waste Reports (Dumpsites)
    if (layersVisible.reports) {
      reports.forEach((rep) => {
        const isCleaned = rep.status === 'cleaned';
        const pinColor = isCleaned
          ? '#10b981'
          : rep.severity === 'Critical'
          ? '#ef4444'
          : '#f59e0b';

        const isSelected = rep.id === selectedReportId;

        const wasteIcon = L.divIcon({
          className: 'custom-waste-pin',
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
            <div style="width:${isSelected ? 34 : 26}px;height:${isSelected ? 34 : 26}px;border-radius:999px;background:${pinColor};border:3px solid #ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px ${pinColor};font-size:13px;">
              ${isCleaned ? '✓' : '⚠️'}
            </div>
            ${
              rep.detected_plate && !isCleaned
                ? `<div style="margin-top:2px;background:#facc15;color:#000;font-family:monospace;font-weight:900;font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid #000;">${rep.detected_plate}</div>`
                : ''
            }
          </div>`,
          iconSize: [40, 44],
          iconAnchor: [20, 22]
        });

        const marker = L.marker([rep.lat, rep.lng], { icon: wasteIcon }).addTo(group);
        marker.on('click', () => {
          if (onSelectReport) onSelectReport(rep.id);
        });

        marker.bindPopup(
          `<div style="font-family:sans-serif;color:#0f172a;min-width:220px;">
            <div style="font-weight:800;font-size:12px;color:${pinColor};text-transform:uppercase;">
              ${isCleaned ? '✅ CLEANED DUMPSITE' : `🚨 ${rep.severity} SEVERITY DUMPSITE`}
            </div>
            <div style="font-weight:700;font-size:13px;margin-top:2px;">${rep.ward_name}</div>
            <div style="font-size:11px;color:#334155;margin-top:4px;">${rep.ai_summary}</div>
            <div style="font-size:11px;margin-top:6px;font-weight:700;">
              Est. Volume: ${rep.estimated_volume_kg} kg • Truck: ${rep.assigned_truck_number || 'Assigned'}
            </div>
            ${
              rep.detected_plate
                ? `<div style="margin-top:4px;background:#fef08a;padding:3px 6px;border-radius:4px;font-family:monospace;font-weight:800;font-size:11px;">RTO Violator Plate: ${rep.detected_plate}</div>`
                : ''
            }
          </div>`
        );
      });
    }
  }, [leafletLoaded, reports, trucks, hotspots, bmtcBuses, layersVisible, selectedReportId, onSelectReport]);

  // Pan to selected report when clicked from queue
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedReportId) return;
    const rep = reports.find((r) => r.id === selectedReportId);
    if (rep) {
      mapInstanceRef.current.flyTo([rep.lat, rep.lng], 14, { duration: 0.8 });
    }
  }, [selectedReportId, reports]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-slate-700/80 bg-[#e5e3df] shadow-inner">
      {/* Map Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[420px] z-10" />

      {/* Top-Left Google Maps Style Map Type Switcher + Layer Pills */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Google Maps Style Segmented Map Type Control */}
        <div className="inline-flex bg-white/95 backdrop-blur-md rounded-lg p-0.5 shadow-md border border-slate-200 pointer-events-auto">
          {[
            { id: 'google_streets', label: 'Map' },
            { id: 'google_hybrid', label: 'Satellite' },
            { id: 'google_terrain', label: 'Terrain' },
            { id: 'google_dark', label: 'Dark Grid' }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setTileProvider(mode.id)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                tileProvider === mode.id
                  ? 'bg-[#1a73e8] text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Floating Google Maps Style Filter Chips */}
        <div className="flex flex-wrap gap-1.5 pointer-events-auto">
          {[
            { key: 'reports', label: '⚠️ Dumpsites', activeClass: 'bg-white text-slate-900 border-amber-500 ring-2 ring-amber-500/20' },
            { key: 'trucks', label: '🚛 BBMP Trucks', activeClass: 'bg-white text-slate-900 border-emerald-500 ring-2 ring-emerald-500/20' },
            { key: 'routes', label: '🧭 Routes', activeClass: 'bg-white text-slate-900 border-blue-500 ring-2 ring-blue-500/20' },
            { key: 'hotspots', label: '🔥 Hotspots', activeClass: 'bg-white text-slate-900 border-rose-500 ring-2 ring-rose-500/20' },
            { key: 'buses', label: '🚌 BMTC Buses', activeClass: 'bg-white text-slate-900 border-indigo-500 ring-2 ring-indigo-500/20' }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() =>
                setLayersVisible((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
              }
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-sm transition-all ${
                layersVisible[item.key]
                  ? item.activeClass
                  : 'bg-slate-900/75 border-slate-700 text-slate-400 hover:bg-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom-Left Google Maps Recenter & Live GPS Badge */}
      <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 flex items-center gap-2 shadow-md font-medium">
          <span className="w-2 h-2 rounded-full bg-[#1a73e8] animate-ping" />
          <span className="font-bold text-[#1a73e8]">Google Maps</span>
          <span className="text-slate-500 font-mono text-[11px]">12.9716° N, 77.5946° E</span>
        </div>

        <button
          onClick={() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.flyTo(BENGALURU_CENTER, 12, { duration: 0.7 });
            }
          }}
          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold shadow-md transition flex items-center gap-1"
          title="Recenter Map on Bengaluru"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#1a73e8]" />
          Recenter
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 5B. CURATED AESTHETIC THEMES & DYNAMIC CSS ENGINE
// ============================================================================
const APP_THEMES = [
  {
    id: 'emerald',
    name: 'Emerald Cyber',
    badge: 'Default Dark',
    dotColor: '#10b981',
    bgClass: 'bg-[#0B1120] text-slate-100',
    headerClass: 'bg-[#0B1120]/90 border-slate-800/80'
  },
  {
    id: 'light',
    name: 'Daylight Glass',
    badge: 'Clean Light',
    dotColor: '#0ea5e9',
    bgClass: 'bg-slate-100 text-slate-900',
    headerClass: 'bg-white/90 border-slate-200'
  },
  {
    id: 'cyberpunk',
    name: 'Midnight Neon',
    badge: 'Indigo Glow',
    dotColor: '#a855f7',
    bgClass: 'bg-[#070514] text-indigo-50',
    headerClass: 'bg-[#0a071d]/90 border-purple-500/20'
  },
  {
    id: 'sunset',
    name: 'Bengaluru Gold',
    badge: 'Warm Obsidian',
    dotColor: '#f59e0b',
    bgClass: 'bg-[#120d0a] text-amber-50',
    headerClass: 'bg-[#18110d]/90 border-amber-500/20'
  },
  {
    id: 'gray',
    name: 'Graphite Gray',
    badge: 'Neutral Studio',
    dotColor: '#9ca3af',
    bgClass: 'bg-[#18181b] text-zinc-100',
    headerClass: 'bg-[#18181b]/95 border-zinc-700/80'
  }
];

// ============================================================================
// 6. MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Navigation Tab State
  const [activeTab, setActiveTab] = useState('command'); // 'command' | 'citizen' | 'bmtc' | 'rto'

  // Aesthetic Theme State
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem('cs_blr_theme') || 'emerald';
  });

  useEffect(() => {
    localStorage.setItem('cs_blr_theme', themeId);
  }, [themeId]);

  const activeTheme = useMemo(
    () => APP_THEMES.find((t) => t.id === themeId) || APP_THEMES[0],
    [themeId]
  );

  const cycleNextTheme = () => {
    const idx = APP_THEMES.findIndex((t) => t.id === themeId);
    const next = APP_THEMES[(idx + 1) % APP_THEMES.length];
    setThemeId(next.id);
    triggerToast(`Theme: ${next.name}`, `Switched UI aesthetic to ${next.badge} mode.`, 'emerald');
  };

  // API Keys & Config State (Reads from env or localStorage, with Zero-Friction Demo Fallback)
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('cleansweep_blr_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return {
      geminiApiKey: '',
      supabaseUrl: '',
      supabaseAnonKey: ''
    };
  });

  // Core Application Entities (Synced to localStorage + Supabase REST if configured)
  const [trucks, setTrucks] = useState(() => {
    const s = localStorage.getItem('cs_blr_trucks_v13');
    return s ? JSON.parse(s) : INITIAL_TRUCKS;
  });

  const [vehicleRegistry, setVehicleRegistry] = useState(() => {
    const s = localStorage.getItem('cs_blr_registry_v13');
    return s ? JSON.parse(s) : INITIAL_VEHICLE_REGISTRY;
  });

  const [reports, setReports] = useState(() => {
    const s = localStorage.getItem('cs_blr_reports_v13');
    return s ? JSON.parse(s) : createInitialReports();
  });

  const [challans, setChallans] = useState(() => {
    const s = localStorage.getItem('cs_blr_challans_v13');
    return s ? JSON.parse(s) : createInitialChallans();
  });

  const [hotspots, setHotspots] = useState(() => {
    const s = localStorage.getItem('cs_blr_hotspots_v13');
    return s ? JSON.parse(s) : INITIAL_HOTSPOTS;
  });

  const [bmtcBuses, setBmtcBuses] = useState(BMTC_ROUTES);

  // Live Clock for < 2-Hour SLA Countdown Timers
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Persist state changes to localStorage
  useEffect(() => {
    localStorage.setItem('cs_blr_trucks_v13', JSON.stringify(trucks));
  }, [trucks]);
  useEffect(() => {
    localStorage.setItem('cs_blr_registry_v13', JSON.stringify(vehicleRegistry));
  }, [vehicleRegistry]);
  useEffect(() => {
    localStorage.setItem('cs_blr_reports_v13', JSON.stringify(reports));
  }, [reports]);
  useEffect(() => {
    localStorage.setItem('cs_blr_challans_v13', JSON.stringify(challans));
  }, [challans]);
  useEffect(() => {
    localStorage.setItem('cs_blr_hotspots_v13', JSON.stringify(hotspots));
  }, [hotspots]);

  // Modals & Notification State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [selectedChallanModal, setSelectedChallanModal] = useState(null);
  const [cleaningReportModal, setCleaningReportModal] = useState(null);
  const [selectedReportId, setSelectedReportId] = useState('rep-102');
  const [toastMessage, setToastMessage] = useState(null);

  const triggerToast = useCallback((title, subtitle, type = 'emerald') => {
    setToastMessage({ title, subtitle, type, id: Date.now() });
    setTimeout(() => {
      setToastMessage((prev) => (prev && prev.title === title ? null : prev));
    }, 5000);
  }, []);

  // Citizen Report Form State
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_SCENARIOS[0].id);
  const [selectedLocationId, setSelectedLocationId] = useState(BENGALURU_LOCATIONS[0].id);
  const [customCoords, setCustomCoords] = useState({
    lat: BENGALURU_LOCATIONS[0].lat,
    lng: BENGALURU_LOCATIONS[0].lng,
    ward: BENGALURU_LOCATIONS[0].ward
  });
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [lastAiResult, setLastAiResult] = useState(null);
  const [lastDispatchSummary, setLastDispatchSummary] = useState(null);

  // BMTC Bus Simulator State
  const [selectedBusId, setSelectedBusId] = useState(BMTC_ROUTES[0].id);
  const [isAutoPatrolActive, setIsAutoPatrolActive] = useState(false);
  
  // Webcam State for BMTC Simulator
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState(null);

  const [bmtcScanLog, setBmtcScanLog] = useState([
    {
      id: 'log-1',
      time: '14:15:22 IST',
      bus: 'Route 335E (KA-57-EV-0892)',
      ward: 'Ward 85 - Doddanekundi / Whitefield Main Rd',
      result: 'Verified High Waste (340kg) -> Dispatched KA-53-G-8821'
    },
    {
      id: 'log-2',
      time: '13:48:10 IST',
      bus: 'Route 500D (KA-57-F-2041)',
      ward: 'Ward 151 - Koramangala 5th Block',
      result: 'Verified Critical Waste (420kg) + ANPR KA05ND4411 -> E-Challan ₹5,000'
    }
  ]);

  // RTO Search Filter State
  const [rtoSearchQuery, setRtoSearchQuery] = useState('');

  // Sync preset selection with preview image & coordinates
  const activePreset = useMemo(
    () => PRESET_SCENARIOS.find((s) => s.id === selectedPresetId) || PRESET_SCENARIOS[0],
    [selectedPresetId]
  );

  const handleSelectPresetScenario = (preset) => {
    setSelectedPresetId(preset.id);
    setUploadedImagePreview(null);
    setUploadedImageBase64(null);
    const loc = BENGALURU_LOCATIONS.find((l) => l.id === preset.locationId) || BENGALURU_LOCATIONS[0];
    setSelectedLocationId(loc.id);
    setCustomCoords({ lat: loc.lat, lng: loc.lng, ward: loc.ward });
  };

  const handleLocationDropdownChange = (locId) => {
    setSelectedLocationId(locId);
    const loc = BENGALURU_LOCATIONS.find((l) => l.id === locId);
    if (loc) {
      setCustomCoords({ lat: loc.lat, lng: loc.lng, ward: loc.ward });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setUploadedImagePreview(dataUrl);
      const base64Part = dataUrl.split(',')[1];
      setUploadedImageBase64({
        data: base64Part,
        mimeType: file.type || 'image/jpeg'
      });
    };
    reader.readAsDataURL(file);
  };

  // ============================================================================
  // 7. GEMINI AI COMPUTER VISION & ANPR ENGINE + CLOSED-LOOP DISPATCH
  // ============================================================================
  const runGeminiVisionAndDispatch = useCallback(
    async ({ sourceType, sourceIdentifier, scenario, customLat, customLng, customWard, imageBase64Obj, previewUrl }) => {
      setIsAnalyzingAi(true);

      let aiJson = null;
      const apiKeyToUse = config.geminiApiKey || '';

      // Prompt strictly matching the required JSON specification
      const systemInstruction = `You are CleanSweep AI, the official Computer Vision & ANPR Engine for Bruhat Bengaluru Mahanagara Palike (BBMP) Solid Waste Management and Karnataka RTO Enforcement.
Analyze the submitted street image for illegal dumpsites ("Black Spots") and any garbage-dumping violator vehicle license plate (especially Karnataka KA registrations).
Return strict JSON with keys:
- is_valid_waste (boolean)
- confidence_score (number between 0.0 and 1.0)
- waste_category (string)
- severity ("Low" | "Medium" | "High" | "Critical")
- estimated_volume_kg (integer)
- violator_detected (boolean)
- license_plate (string or null, e.g. "KA01MJ2026")
- ai_summary (concise string describing the waste pile and any violator vehicle)`;

      // Attempt live Gemini API call if an uploaded image or API key is present
      if (imageBase64Obj) {
        try {
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKeyToUse}`;
          const payload = {
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Analyze this Bengaluru street waste report image and extract any Karnataka RTO license plate in strict JSON.' },
                  {
                    inlineData: {
                      mimeType: imageBase64Obj.mimeType,
                      data: imageBase64Obj.data
                    }
                  }
                ]
              }
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json'
            }
          };

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            const result = await response.json();
            const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              aiJson = JSON.parse(rawText);
            }
          }
        } catch (err) {
          // Graceful fallback to deterministic Bengaluru scenario analysis
        }
      } else {
        // Brief realistic scan latency for preset scenarios
        await new Promise((r) => setTimeout(r, 950));
      }

      // Fallback / Preset Structured Output if no custom upload or if offline
      if (!aiJson) {
        aiJson = {
          is_valid_waste: true,
          confidence_score: scenario.confidenceScore || 0.96,
          waste_category: scenario.wasteCategory,
          severity: scenario.severity,
          estimated_volume_kg: scenario.estimatedVolumeKg,
          violator_detected: Boolean(scenario.violatorDetected),
          license_plate: scenario.licensePlate || null,
          ai_summary: scenario.aiSummary
        };
      }

      setLastAiResult(aiJson);

      if (!aiJson.is_valid_waste) {
        setIsAnalyzingAi(false);
        triggerToast('Report Rejected by AI Vision', 'No valid municipal solid waste detected in frame.', 'rose');
        return;
      }

      // ----------------------------------------------------------------------
      // STEP 3A: HAVERSINE NEAREST BBMP TRUCK DISPATCH & < 2-HOUR SLA TIMER
      // ----------------------------------------------------------------------
      const rankedTrucks = trucks
        .map((t) => ({
          ...t,
          distanceKm: calculateHaversineDistanceKm(customLat, customLng, t.current_lat, t.current_lng)
        }))
        .sort((a, b) => {
          // Prioritize 'available' trucks first, then closest Haversine distance
          if (a.status === 'available' && b.status !== 'available') return -1;
          if (a.status !== 'available' && b.status === 'available') return 1;
          return a.distanceKm - b.distanceKm;
        });

      const nearestTruck = rankedTrucks[0];
      const now = new Date();
      const slaDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 Hours (< 02:00:00 SLA)
      const normalizedPlate = normalizeLicensePlate(aiJson.license_plate);

      const finalEvidenceUrl =
        previewUrl ||
        createStreetEvidenceDataUrl({
          title: scenario.title,
          ward: customWard,
          plate: normalizedPlate,
          vehicleName: scenario.vehicleName,
          wasteType: `${aiJson.waste_category.slice(0, 34)} (${aiJson.estimated_volume_kg} kg)`,
          severity: aiJson.severity,
          sourceTag: sourceType === 'bmtc_bus_camera' ? 'BMTC AI BUS CAM' : 'CITIZEN REPORT',
          photoUrl: scenario.photoUrl
        });

      const newReportId = `rep-${Date.now()}`;
      const newReport = {
        id: newReportId,
        source_type: sourceType,
        source_identifier: sourceIdentifier,
        image_url: finalEvidenceUrl,
        after_image_url: null,
        lat: customLat,
        lng: customLng,
        ward_name: customWard,
        is_verified: true,
        ai_confidence: aiJson.confidence_score,
        waste_category: aiJson.waste_category,
        severity: aiJson.severity,
        estimated_volume_kg: aiJson.estimated_volume_kg,
        ai_summary: aiJson.ai_summary,
        detected_plate: normalizedPlate,
        status: 'dispatched',
        assigned_truck_id: nearestTruck?.id || null,
        assigned_truck_number: nearestTruck?.truck_number || 'KA-01-G-4401',
        dispatch_distance_km: nearestTruck?.distanceKm || 0.45,
        created_at: now.toISOString(),
        sla_deadline: slaDeadline.toISOString(),
        dispatched_at: now.toISOString(),
        cleaned_at: null,
        resolution_minutes: null
      };

      setReports((prev) => [newReport, ...prev]);
      setSelectedReportId(newReportId);

      // Update assigned BBMP Truck status to 'en_route'
      if (nearestTruck) {
        setTrucks((prev) =>
          prev.map((t) => (t.id === nearestTruck.id ? { ...t, status: 'en_route' } : t))
        );
      }

      // ----------------------------------------------------------------------
      // BENGALURU BLACK-SPOT (HOTSPOT) 200M RADIUS ANALYTICS
      // ----------------------------------------------------------------------
      setHotspots((prevHotspots) => {
        const existingIdx = prevHotspots.findIndex(
          (h) => calculateHaversineDistanceKm(customLat, customLng, h.center_lat, h.center_lng) <= 0.35
        );
        if (existingIdx > -1) {
          const updated = [...prevHotspots];
          const newCount = updated[existingIdx].incident_count + 1;
          const recommended =
            newCount >= 5
              ? 'Install Permanent Smart Bin & AI CCTV'
              : newCount >= 3
              ? 'Deploy BBMP Marshals for Night Patrol'
              : 'Normal Monitoring';
          updated[existingIdx] = {
            ...updated[existingIdx],
            incident_count: newCount,
            last_incident_at: now.toISOString(),
            recommended_action: recommended
          };
          return updated;
        } else {
          return [
            ...prevHotspots,
            {
              id: `hs-${Date.now()}`,
              ward_name: customWard,
              center_lat: customLat,
              center_lng: customLng,
              incident_count: 1,
              last_incident_at: now.toISOString(),
              recommended_action: 'Normal Monitoring'
            }
          ];
        }
      });

      // ----------------------------------------------------------------------
      // STEP 3B: KARNATAKA RTO AUTOMATED CIVIL PENALTY LOOP (E-CHALLAN)
      // ----------------------------------------------------------------------
      let generatedChallan = null;
      if (normalizedPlate) {
        const existingVeh = vehicleRegistry.find((v) => v.license_plate === normalizedPlate);
        const priorOffenses = existingVeh ? existingVeh.prior_offenses_count : 0;
        const fineAmount = priorOffenses >= 1 ? 5000 : 2500;
        const challanNum = `BBMP-SWM-2026-${Math.floor(10000 + Math.random() * 90000)}`;

        const ownerRecord = existingVeh || {
          license_plate: normalizedPlate,
          owner_name: 'Registered Commercial Carrier (KA RTO)',
          owner_phone: '+91 98450 99000',
          owner_email: 'rto-notice@karnataka.gov.in',
          rto_zone: `KA-${normalizedPlate.slice(2, 4)} Bengaluru RTO`,
          vehicle_type: 'Commercial Goods Vehicle',
          vehicle_model: 'Light Goods Carrier',
          prior_offenses_count: 0
        };

        generatedChallan = {
          id: `chal-${Date.now()}`,
          challan_number: challanNum,
          report_id: newReportId,
          license_plate: normalizedPlate,
          owner_name: ownerRecord.owner_name,
          owner_phone: ownerRecord.owner_phone,
          owner_email: ownerRecord.owner_email,
          rto_zone: ownerRecord.rto_zone,
          vehicle_model: `${ownerRecord.vehicle_model} (${ownerRecord.vehicle_type})`,
          fine_amount: fineAmount,
          prior_offenses: priorOffenses,
          evidence_image_url: finalEvidenceUrl,
          ward_name: customWard,
          violation_lat: customLat,
          violation_lng: customLng,
          status: 'issued',
          issued_at: now.toISOString()
        };

        setChallans((prev) => [generatedChallan, ...prev]);

        // Increment prior offenses count in Karnataka RTO Registry
        setVehicleRegistry((prev) => {
          const exists = prev.some((v) => v.license_plate === normalizedPlate);
          if (exists) {
            return prev.map((v) =>
              v.license_plate === normalizedPlate
                ? { ...v, prior_offenses_count: v.prior_offenses_count + 1 }
                : v
            );
          }
          return [{ ...ownerRecord, prior_offenses_count: 1 }, ...prev];
        });
      }

      setLastDispatchSummary({
        report: newReport,
        nearestTruck,
        rankedTrucks,
        challan: generatedChallan
      });

      setIsAnalyzingAi(false);

      if (generatedChallan) {
        triggerToast(
          `Dispatched ${nearestTruck?.truck_number} & Issued E-Challan!`,
          `Plate ${normalizedPlate} fined ₹${generatedChallan.fine_amount.toLocaleString('en-IN')} (${generatedChallan.challan_number})`,
          'amber'
        );
      } else {
        triggerToast(
          `Verified & Dispatched ${nearestTruck?.truck_number}`,
          `Distance: ${nearestTruck?.distanceKm} km • < 2-Hour SLA Countdown Started`,
          'emerald'
        );
      }
    },
    [config.geminiApiKey, trucks, vehicleRegistry, triggerToast]
  );

  // ============================================================================
  // 8. CREW RESOLUTION FLOW (MARK SPOT CLEANED & STOP < 2-HR SLA TIMER)
  // ============================================================================
  const handleMarkReportCleaned = (report) => {
    const now = new Date();
    const createdMs = new Date(report.created_at).getTime();
    const elapsedMins = Math.max(1, Math.round((now.getTime() - createdMs) / 60000));

    const cleanedAfterUrl = createStreetEvidenceDataUrl({
      title: `${report.ward_name.split('-')[1]?.trim() || 'Bengaluru Spot'} (CLEANED)`,
      ward: report.ward_name,
      plate: null,
      wasteType: 'BBMP Crew Verified Clean & Sanitized',
      severity: 'Low',
      isCleaned: true,
      sourceTag: 'BBMP AFTER-PHOTO PROOF'
    });

    setReports((prev) =>
      prev.map((r) =>
        r.id === report.id
          ? {
              ...r,
              status: 'cleaned',
              after_image_url: cleanedAfterUrl,
              cleaned_at: now.toISOString(),
              resolution_minutes: elapsedMins
            }
          : r
      )
    );

    if (report.assigned_truck_id) {
      setTrucks((prev) =>
        prev.map((t) =>
          t.id === report.assigned_truck_id ? { ...t, status: 'available' } : t
        )
      );
    }

    setCleaningReportModal(null);
    triggerToast(
      `Spot Cleaned in ${elapsedMins} mins (< 2-Hr SLA Met!)`,
      `Truck ${report.assigned_truck_number} freed & ready for next BBMP dispatch.`,
      'emerald'
    );
  };

  // ============================================================================
  // 9. BMTC BUS AUTO-PATROL SIMULATION EFFECT & WEBCAM
  // ============================================================================
  const toggleWebcam = async () => {
    if (isWebcamActive) {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
      setWebcamStream(null);
      setIsWebcamActive(false);
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerToast('Camera Not Supported', 'Webcam access is restricted in this environment.', 'rose');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setWebcamStream(stream);
        setIsWebcamActive(true);
      } catch (err) {
        console.warn("Webcam issue:", err.message);
        if (err.name === 'NotFoundError' || err.message.includes('device not found')) {
          triggerToast('No Webcam Found', 'Could not detect a camera connected to your device.', 'rose');
        } else {
          triggerToast('Webcam Access Denied', 'Please allow camera permissions to use the live feed.', 'rose');
        }
        setIsWebcamActive(false);
      }
    }
  };

  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
    }
  }, [isWebcamActive, webcamStream]);

  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [webcamStream]);

  const handleSimulateBmtcCapture = useCallback(
    (busObj) => {
      const targetBus = busObj || bmtcBuses.find((b) => b.id === selectedBusId) || bmtcBuses[0];
      const scenario = PRESET_SCENARIOS[targetBus.linkedScenarioIndex % PRESET_SCENARIOS.length];
      const loc = BENGALURU_LOCATIONS.find((l) => l.id === scenario.locationId) || BENGALURU_LOCATIONS[0];

      // Slightly jitter GPS along the route corridor so each capture is unique
      const jitterLat = Number((loc.lat + (Math.random() - 0.5) * 0.003).toFixed(4));
      const jitterLng = Number((loc.lng + (Math.random() - 0.5) * 0.003).toFixed(4));

      let customImageBase64 = null;
      let customPreviewUrl = null;

      if (isWebcamActive && videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          customPreviewUrl = canvas.toDataURL('image/jpeg');
          customImageBase64 = {
            data: customPreviewUrl.split(',')[1],
            mimeType: 'image/jpeg'
          };
        }
      }

      runGeminiVisionAndDispatch({
        sourceType: 'bmtc_bus_camera',
        sourceIdentifier: `BMTC ${targetBus.routeCode} (${targetBus.busNumber})`,
        scenario,
        customLat: jitterLat,
        customLng: jitterLng,
        customWard: loc.ward,
        imageBase64Obj: customImageBase64,
        previewUrl: customPreviewUrl
      });

      const timeStr = new Date().toLocaleTimeString('en-IN', { hour12: false }) + ' IST';
      setBmtcScanLog((prev) => [
        {
          id: `log-${Date.now()}`,
          time: timeStr,
          bus: `${targetBus.routeCode} (${targetBus.busNumber})`,
          ward: loc.ward,
          result: `AI Verified ${scenario.severity} Waste (${scenario.estimatedVolumeKg}kg)${
            scenario.licensePlate ? ` + Plate ${scenario.licensePlate}` : ''
          }`
        },
        ...prev.slice(0, 9)
      ]);
    },
    [bmtcBuses, selectedBusId, runGeminiVisionAndDispatch, isWebcamActive]
  );

  useEffect(() => {
    if (!isAutoPatrolActive) return;
    const interval = setInterval(() => {
      const randomBus = bmtcBuses[Math.floor(Math.random() * bmtcBuses.length)];
      handleSimulateBmtcCapture(randomBus);
    }, 10000);
    return () => clearInterval(interval);
  }, [isAutoPatrolActive, bmtcBuses, handleSimulateBmtcCapture]);

  // Reset / Seed Demo Data Handler
  const handleResetDemoData = () => {
    setTrucks(INITIAL_TRUCKS);
    setVehicleRegistry(INITIAL_VEHICLE_REGISTRY);
    setReports(createInitialReports());
    setChallans(createInitialChallans());
    setHotspots(INITIAL_HOTSPOTS);
    setLastAiResult(null);
    setLastDispatchSummary(null);
    triggerToast(
      'Bengaluru Seed Data Restored',
      'Reset BBMP trucks, RTO registry, active < 2-hr SLA reports, and Black-Spot hotspots.',
      'emerald'
    );
  };

  // ============================================================================
  // 10. COMPUTED KPI METRICS
  // ============================================================================
  const kpis = useMemo(() => {
    const activeReports = reports.filter((r) => r.status !== 'cleaned');
    const cleanedReports = reports.filter((r) => r.status === 'cleaned');
    const avgResolution =
      cleanedReports.length > 0
        ? Math.round(
            cleanedReports.reduce((acc, r) => acc + (r.resolution_minutes || 38), 0) /
              cleanedReports.length
          )
        : 38;
    const totalFinesAmount = challans.reduce((acc, c) => acc + Number(c.fine_amount || 0), 0);
    const availableTrucksCount = trucks.filter((t) => t.status === 'available').length;
    const criticalHotspotsCount = hotspots.filter((h) => h.incident_count >= 3).length;

    return {
      activeCount: activeReports.length,
      cleanedCount: cleanedReports.length,
      avgResolution,
      totalFinesAmount,
      availableTrucksCount,
      totalTrucks: trucks.length,
      criticalHotspotsCount
    };
  }, [reports, challans, trucks, hotspots]);

  const currentCitizenPreviewUrl = useMemo(() => {
    if (uploadedImagePreview) return uploadedImagePreview;
    return createStreetEvidenceDataUrl({
      title: activePreset.title,
      ward: customCoords.ward,
      plate: activePreset.licensePlate,
      vehicleName: activePreset.vehicleName,
      wasteType: `${activePreset.wasteCategory.slice(0, 34)} (${activePreset.estimatedVolumeKg} kg)`,
      severity: activePreset.severity,
      sourceTag: 'CITIZEN CAM PREVIEW',
      photoUrl: activePreset.photoUrl
    });
  }, [uploadedImagePreview, activePreset, customCoords.ward]);

  return (
    <div
      data-theme={themeId}
      className={`min-h-screen ${activeTheme.bgClass} font-sans selection:bg-emerald-500 selection:text-slate-950 flex flex-col transition-colors duration-300`}
    >
      {/* Dynamic Aesthetic Theme Overrides */}
      <style>{`
        /* Daylight Glass (Clean Light Mode) Overrides */
        [data-theme="light"] {
          background-image: radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.08) 0px, transparent 50%),
                            radial-gradient(at 100% 0%, rgba(14, 165, 233, 0.08) 0px, transparent 50%);
        }
        [data-theme="light"] .bg-\\[\\#1E293B\\]\\/70,
        [data-theme="light"] .bg-\\[\\#1E293B\\]\\/80 {
          background-color: rgba(255, 255, 255, 0.92) !important;
          border-color: #cbd5e1 !important;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.06) !important;
        }
        [data-theme="light"] .bg-slate-900\\/60,
        [data-theme="light"] .bg-slate-900\\/70,
        [data-theme="light"] .bg-slate-900\\/75,
        [data-theme="light"] .bg-slate-900\\/80,
        [data-theme="light"] .bg-slate-900\\/90,
        [data-theme="light"] .bg-slate-900 {
          background-color: #f8fafc !important;
          border-color: #e2e8f0 !important;
          color: #0f172a !important;
        }
        [data-theme="light"] .bg-slate-950,
        [data-theme="light"] .bg-slate-950\\/90 {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          color: #0f172a !important;
        }
        [data-theme="light"] .bg-slate-800\\/95,
        [data-theme="light"] .bg-slate-800 {
          background-color: #e2e8f0 !important;
          color: #0f172a !important;
        }
        [data-theme="light"] .text-white,
        [data-theme="light"] .text-slate-100,
        [data-theme="light"] .text-slate-200 {
          color: #0f172a !important;
        }
        [data-theme="light"] .text-slate-300,
        [data-theme="light"] .text-slate-400 {
          color: #475569 !important;
        }
        [data-theme="light"] .text-emerald-400,
        [data-theme="light"] .text-emerald-300 {
          color: #059669 !important;
        }
        [data-theme="light"] .text-amber-400,
        [data-theme="light"] .text-amber-300 {
          color: #d97706 !important;
        }
        [data-theme="light"] .text-sky-400,
        [data-theme="light"] .text-blue-300 {
          color: #0284c7 !important;
        }
        [data-theme="light"] .text-rose-400,
        [data-theme="light"] .text-rose-300 {
          color: #e11d48 !important;
        }
        [data-theme="light"] .border-slate-800,
        [data-theme="light"] .border-slate-800\\/80,
        [data-theme="light"] .border-slate-700,
        [data-theme="light"] .border-slate-700\\/80 {
          border-color: #e2e8f0 !important;
        }

        /* Midnight Neon (Cyberpunk Glow) Overrides */
        [data-theme="cyberpunk"] {
          background-image: radial-gradient(at 15% 10%, rgba(168, 85, 247, 0.16) 0px, transparent 45%),
                            radial-gradient(at 85% 20%, rgba(6, 182, 212, 0.14) 0px, transparent 50%);
        }
        [data-theme="cyberpunk"] .bg-\\[\\#1E293B\\]\\/70,
        [data-theme="cyberpunk"] .bg-\\[\\#1E293B\\]\\/80 {
          background-color: rgba(19, 14, 43, 0.78) !important;
          border-color: rgba(168, 85, 247, 0.28) !important;
          box-shadow: 0 0 25px -5px rgba(168, 85, 247, 0.12) !important;
        }
        [data-theme="cyberpunk"] .bg-slate-900\\/60,
        [data-theme="cyberpunk"] .bg-slate-900\\/75,
        [data-theme="cyberpunk"] .bg-slate-900\\/80,
        [data-theme="cyberpunk"] .bg-slate-900\\/90 {
          background-color: rgba(12, 9, 28, 0.85) !important;
          border-color: rgba(139, 92, 246, 0.22) !important;
        }

        /* Bengaluru Gold (Warm Obsidian Sunset) Overrides */
        [data-theme="sunset"] {
          background-image: radial-gradient(at 10% 0%, rgba(245, 158, 11, 0.14) 0px, transparent 50%),
                            radial-gradient(at 90% 10%, rgba(239, 68, 68, 0.1) 0px, transparent 45%);
        }
        [data-theme="sunset"] .bg-\\[\\#1E293B\\]\\/70,
        [data-theme="sunset"] .bg-\\[\\#1E293B\\]\\/80 {
          background-color: rgba(34, 24, 19, 0.82) !important;
          border-color: rgba(245, 158, 11, 0.25) !important;
        }
        [data-theme="sunset"] .bg-slate-900\\/60,
        [data-theme="sunset"] .bg-slate-900\\/75,
        [data-theme="sunset"] .bg-slate-900\\/80,
        [data-theme="sunset"] .bg-slate-900\\/90 {
          background-color: rgba(24, 17, 13, 0.88) !important;
          border-color: rgba(245, 158, 11, 0.18) !important;
        }

        /* Graphite Gray (Proper Neutral Monochrome Studio) Overrides */
        [data-theme="gray"] {
          background-image: radial-gradient(at 50% 0%, rgba(161, 161, 170, 0.08) 0px, transparent 60%);
        }
        [data-theme="gray"] .bg-\\[\\#1E293B\\]\\/70,
        [data-theme="gray"] .bg-\\[\\#1E293B\\]\\/80 {
          background-color: rgba(39, 39, 42, 0.85) !important;
          border-color: #3f3f46 !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35) !important;
        }
        [data-theme="gray"] .bg-slate-900\\/60,
        [data-theme="gray"] .bg-slate-900\\/70,
        [data-theme="gray"] .bg-slate-900\\/75,
        [data-theme="gray"] .bg-slate-900\\/80,
        [data-theme="gray"] .bg-slate-900\\/90,
        [data-theme="gray"] .bg-slate-900 {
          background-color: #27272a !important;
          border-color: #3f3f46 !important;
        }
        [data-theme="gray"] .bg-slate-950,
        [data-theme="gray"] .bg-slate-950\\/90 {
          background-color: #18181b !important;
          border-color: #3f3f46 !important;
        }
        [data-theme="gray"] .bg-slate-800\\/95,
        [data-theme="gray"] .bg-slate-800,
        [data-theme="gray"] .bg-slate-800\\/60 {
          background-color: #3f3f46 !important;
          border-color: #52525b !important;
        }
        [data-theme="gray"] .border-slate-800,
        [data-theme="gray"] .border-slate-800\\/80,
        [data-theme="gray"] .border-slate-800\\/90,
        [data-theme="gray"] .border-slate-700,
        [data-theme="gray"] .border-slate-700\\/80 {
          border-color: #3f3f46 !important;
        }
        [data-theme="gray"] .text-slate-400,
        [data-theme="gray"] .text-slate-300 {
          color: #a1a1aa !important;
        }
      `}</style>

      {/* ====================================================================
          TOP NAVIGATION BAR
      ==================================================================== */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b px-4 lg:px-6 py-2.5 transition-colors duration-300 ${activeTheme.headerClass}`}>
        <div className="max-w-[1600px] w-full mx-auto flex flex-col gap-2.5">
          {/* Line 1: CleanSweep AI Brand on left, immediately followed towards the left by Theme Switcher, Reset, SQL, and API Keys */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              {/* Brand Logo & Title */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/10 border border-emerald-300/30">
                  <Sparkles className="w-4 h-4 text-slate-950" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white leading-none">
                    CleanSweep <span className="text-emerald-400">AI</span>
                  </h1>
                  <p className="text-[10px] text-slate-400 hidden sm:block mt-0.5">
                    Bengaluru Smart Waste • UN SDG 11
                  </p>
                </div>
              </div>

              {/* Utility Controls positioned right after the brand title towards the left */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Aesthetic Theme Switcher Button */}
                <button
                  onClick={cycleNextTheme}
                  title={`Current Theme: ${activeTheme.name} (Click to switch aesthetic)`}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-emerald-500/40 transition flex items-center gap-2 text-xs font-semibold shadow-sm"
                >
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: activeTheme.dotColor }}
                  />
                  <span className="hidden sm:inline">{activeTheme.name}</span>
                </button>

                <button
                  onClick={handleResetDemoData}
                  title="Reset / Seed Bengaluru Demo Data"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Reset</span>
                </button>

                <button
                  onClick={() => setShowSqlModal(true)}
                  title="View / Download supabase_setup.sql"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-medium"
                >
                  <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">SQL</span>
                </button>

                <button
                  onClick={() => setShowConfigModal(true)}
                  title="Configure Gemini & Supabase API Keys"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 transition flex items-center gap-1.5 text-xs font-medium"
                >
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">API Keys</span>
                </button>
              </div>
            </div>

            {/* Status Indicator */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-800/80 text-[11px] font-medium text-slate-400 shrink-0"
              title="Database Connection Status"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {config.supabaseUrl ? 'Supabase Connected' : 'Demo Mode'}
            </div>
          </div>

          {/* Line 2: BBMP Grid badge and Tabs moved to this new line till RTO Challans */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-slate-800/60">
            <nav className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 overflow-x-auto no-scrollbar">
              {[
                { id: 'command', label: 'Command Grid', icon: MapPin, badge: kpis.activeCount },
                { id: 'citizen', label: 'Citizen Report', icon: Camera, badge: '< 2Hr' },
                { id: 'bmtc', label: 'BMTC Cam', icon: Bus, badge: isAutoPatrolActive ? 'AUTO' : null },
                { id: 'rto', label: 'RTO Challans', icon: ShieldAlert, badge: challans.length }
              ].map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                    {tab.badge !== null && (
                      <span
                        className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                          active
                            ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-slate-900 text-emerald-400 border border-slate-700/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                BBMP Grid Active
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900/95 backdrop-blur-xl border-2 border-emerald-500/60 rounded-2xl p-4 shadow-2xl flex items-start gap-3 animate-bounce">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">{toastMessage.title}</div>
            <div className="text-xs text-slate-300 mt-0.5">{toastMessage.subtitle}</div>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          MAIN CONTENT AREA
      ==================================================================== */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-4 space-y-5">
        {/* TOP KPI STRIP (Sleek & Compact) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700/80 transition">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Active Black-Spots
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-xl sm:text-2xl font-extrabold text-amber-400">
                  {kpis.activeCount}
                </p>
                <span className="text-[10px] text-slate-500">&lt; 2-Hr SLA</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700/80 transition">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Avg Resolution
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl sm:text-2xl font-extrabold text-emerald-400">
                  {kpis.avgResolution}m
                </p>
                <span className="text-[10px] text-emerald-400/70">Target &lt; 120m</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700/80 transition">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                BBMP Fleet Ready
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl sm:text-2xl font-extrabold text-sky-400">
                  {kpis.availableTrucksCount}<span className="text-sm text-slate-500 font-semibold">/{kpis.totalTrucks}</span>
                </p>
                <span className="text-[10px] text-slate-500">GPS Routed</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700/80 transition">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                RTO E-Challans
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl sm:text-2xl font-extrabold text-rose-400">
                  ₹{kpis.totalFinesAmount.toLocaleString('en-IN')}
                </p>
                <span className="text-[10px] text-rose-400/70">{challans.length} fined</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>

          <div className="col-span-2 lg:col-span-1 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-slate-700/80 transition">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Repeat Hotspots
              </p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl sm:text-2xl font-extrabold text-purple-400">
                  {kpis.criticalHotspotsCount}
                </p>
                <span className="text-[10px] text-slate-500">Wards Monitored</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* ==================================================================
            VIEW 1: BBMP COMMAND CENTER (GIS MAP + SLA DISPATCH QUEUE + HOTSPOTS)
        ================================================================== */}
        {activeTab === 'command' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 7 Cols: Live Bengaluru Leaflet GIS Map */}
              <div className="lg:col-span-7 bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-400" />
                      Bengaluru BBMP Live Spatial Command Grid
                    </h2>
                    <p className="text-xs text-slate-400">
                      Real-time Haversine truck routing, 200m Black-Spot clusters &amp; BMTC AI camera telemetry
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('citizen')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      + Report Dumpsite
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-[460px]">
                  <BengaluruLeafletMap
                    reports={reports}
                    trucks={trucks}
                    hotspots={hotspots}
                    bmtcBuses={bmtcBuses}
                    selectedReportId={selectedReportId}
                    onSelectReport={(id) => setSelectedReportId(id)}
                  />
                </div>
              </div>

              {/* Right 5 Cols: Active < 2-Hour SLA Dispatch Queue */}
              <div className="lg:col-span-5 bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col max-h-[550px]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Active &lt; 2-Hour SLA Dispatch Queue
                    </h2>
                    <p className="text-xs text-slate-400">
                      North Star Metric: Clean every verified report under 02:00:00
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {reports.filter((r) => r.status !== 'cleaned').length} Active
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {reports.map((rep) => {
                    const isCleaned = rep.status === 'cleaned';
                    const sla = formatCountdown(rep.sla_deadline, nowMs);
                    const isSelected = rep.id === selectedReportId;

                    return (
                      <div
                        key={rep.id}
                        onClick={() => setSelectedReportId(rep.id)}
                        className={`p-3.5 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/95 border-emerald-500/70 shadow-lg'
                            : 'bg-slate-900/75 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <img
                            src={isCleaned && rep.after_image_url ? rep.after_image_url : rep.image_url}
                            alt={rep.ward_name}
                            className="w-24 h-20 object-cover rounded-lg border border-slate-700 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  isCleaned
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : rep.severity === 'Critical'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {isCleaned ? `✓ CLEANED (${rep.resolution_minutes}m)` : `${rep.severity} • ${rep.estimated_volume_kg} kg`}
                              </span>

                              {/* Live Countdown Timer Badge */}
                              {!isCleaned ? (
                                <span className="font-mono text-xs font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                                  <Clock className="w-3 h-3 animate-spin" />
                                  {sla.text}
                                </span>
                              ) : (
                                <span className="font-mono text-[11px] font-bold text-emerald-400">
                                  SLA Met ✓
                                </span>
                              )}
                            </div>

                            <h3 className="text-xs sm:text-sm font-bold text-white truncate mt-1">
                              {rep.ward_name}
                            </h3>
                            <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                              {rep.ai_summary}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/80 text-[11px]">
                              <span className="text-emerald-300 font-semibold flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5" />
                                {rep.assigned_truck_number || 'KA-01-G-4401'} ({rep.dispatch_distance_km || 0.4} km)
                              </span>

                              {rep.detected_plate && (
                                <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-slate-950 font-mono font-black text-[10px]">
                                  IND {rep.detected_plate}
                                </span>
                              )}

                              {!isCleaned && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCleaningReportModal(rep);
                                  }}
                                  className="ml-auto px-2.5 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[11px] transition flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  Mark Spot Cleaned
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Row: BBMP Fleet Status & Bengaluru 200m Black-Spot Hotspot Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* BBMP Compactor Truck Fleet Table */}
              <div className="lg:col-span-7 bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <Truck className="w-4 h-4 text-sky-400" />
                      BBMP Solid Waste Management Compactor &amp; Tipper Fleet
                    </h3>
                    <p className="text-xs text-slate-400">
                      Automatic Haversine nearest-truck assignment across Bengaluru zones
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2.5 px-3">Truck Reg</th>
                        <th className="py-2.5 px-3">BBMP Zone</th>
                        <th className="py-2.5 px-3">Driver &amp; Contact</th>
                        <th className="py-2.5 px-3">GPS Coordinates</th>
                        <th className="py-2.5 px-3">Capacity</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {trucks.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-white">
                            {t.truck_number}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{t.bbmp_zone}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-200">{t.driver_name}</div>
                            <div className="text-[10px] text-slate-400">{t.driver_phone}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                            {t.current_lat.toFixed(4)}, {t.current_lng.toFixed(4)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{t.capacity_kg} kg</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                t.status === 'available'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bengaluru Black-Spot (Hotspot) 200m Radius Analytics */}
              <div className="lg:col-span-5 bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-400" />
                      Bengaluru Black-Spot (Hotspot) Analytics
                    </h3>
                    <p className="text-xs text-slate-400">
                      200m repeat dumping radius triggers BBMP Marshal &amp; Smart Bin deployment
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {hotspots.map((hs) => {
                    const isMarshal = hs.incident_count >= 3 && hs.incident_count < 5;
                    const isCctv = hs.incident_count >= 5;
                    return (
                      <div
                        key={hs.id}
                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-white">{hs.ward_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            GPS: {hs.center_lat.toFixed(4)}, {hs.center_lng.toFixed(4)}
                          </div>
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                              isCctv
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isMarshal
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            <ShieldAlert className="w-3 h-3" />
                            {hs.recommended_action}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div
                            className={`text-xl font-black ${
                              isCctv ? 'text-rose-400' : isMarshal ? 'text-amber-400' : 'text-sky-400'
                            }`}
                          >
                            {hs.incident_count}x
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">
                            Incidents
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 2: BENGALURU CITIZEN REPORT & < 2-HOUR SLA TRACKER
        ================================================================== */}
        {activeTab === 'citizen' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 Cols: Citizen Upload & Preset Evidence Selector */}
            <div className="lg:col-span-6 space-y-5">
              <div className="bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Step 1 &amp; Step 2 • Citizen Portal + Gemini Vision
                    </span>
                    <h2 className="text-lg font-extrabold text-white mt-1">
                      Report Bengaluru Illegal Dumpsite / Violator Vehicle
                    </h2>
                    <p className="text-xs text-slate-400">
                      Upload a photo or test with 1-click Bengaluru street evidence scenarios
                    </p>
                  </div>
                </div>

                {/* 1-Click Preset Bengaluru Evidence Scenarios */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    1. Select Preset Bengaluru Scenario (or Upload Custom Photo Below)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRESET_SCENARIOS.map((scen) => {
                      const active = selectedPresetId === scen.id && !uploadedImagePreview;
                      return (
                        <button
                          key={scen.id}
                          onClick={() => handleSelectPresetScenario(scen)}
                          className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                              : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold leading-snug">{scen.title}</div>
                          <div className="flex items-center justify-between mt-2 text-[10px]">
                            <span className="text-amber-300 font-semibold">
                              {scen.severity} • {scen.estimatedVolumeKg} kg
                            </span>
                            {scen.licensePlate ? (
                              <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-slate-950 font-mono font-black">
                                {scen.licensePlate}
                              </span>
                            ) : (
                              <span className="text-slate-400">No Vehicle</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Image File Upload + Live Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      2. Evidence Photo Preview
                    </label>
                    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-video group">
                      <img
                        src={currentCitizenPreviewUrl}
                        alt="Bengaluru Evidence Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = REAL_WASTE_PHOTOS.fallback;
                        }}
                      />
                      {!uploadedImagePreview && (
                        <>
                          <div className="absolute top-2 left-2 bg-slate-950/85 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono font-bold text-red-400 border border-red-500/40 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                            AI CAM • {activePreset.severity.toUpperCase()}
                          </div>
                          {activePreset.licensePlate && (
                            <div className="absolute bottom-2 right-2 bg-yellow-400 text-slate-950 px-2 py-0.5 rounded border-2 border-slate-950 font-mono font-black text-xs shadow-lg">
                              IND {activePreset.licensePlate}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      Upload Custom Photo (Optional)
                    </label>
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-emerald-400 rounded-xl bg-slate-900/60 cursor-pointer transition text-center">
                      <Upload className="w-6 h-6 text-emerald-400 mb-1.5" />
                      <span className="text-xs font-bold text-slate-200">
                        Click to Upload Street / Violator Photo
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        JPG, PNG, WebP analyzed by Gemini 2.5 Flash
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    {uploadedImagePreview && (
                      <button
                        onClick={() => {
                          setUploadedImagePreview(null);
                          setUploadedImageBase64(null);
                        }}
                        className="w-full py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 hover:text-white"
                      >
                        Revert to Preset Bengaluru Street Scene
                      </button>
                    )}
                  </div>
                </div>

                {/* Bengaluru Preset GPS Location Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      3. Bengaluru BBMP Ward / Landmark Location
                    </label>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => handleLocationDropdownChange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white font-semibold focus:outline-none focus:border-emerald-500"
                    >
                      {BENGALURU_LOCATIONS.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.lat}, {loc.lng})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Exact Lat / Lng
                    </label>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono text-emerald-400 flex items-center justify-between">
                      <span>
                        {customCoords.lat}, {customCoords.lng}
                      </span>
                      <Crosshair className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* Submit to Gemini Vision & Trigger Dispatch + E-Challan */}
                <button
                  disabled={isAnalyzingAi}
                  onClick={() =>
                    runGeminiVisionAndDispatch({
                      sourceType: 'citizen_upload',
                      sourceIdentifier: 'Bengaluru Citizen Portal',
                      scenario: activePreset,
                      customLat: customCoords.lat,
                      customLng: customCoords.lng,
                      customWard: customCoords.ward,
                      imageBase64Obj: uploadedImageBase64,
                      previewUrl: uploadedImagePreview
                    })
                  }
                  className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAnalyzingAi ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Scanning with Gemini 2.5 Flash Vision &amp; ANPR...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Analyze with Gemini AI, Dispatch Nearest BBMP Truck &amp; Issue RTO E-Challan</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right 6 Cols: Gemini Strict JSON Output + Haversine Breakdown */}
            <div className="lg:col-span-6 space-y-5">
              {/* Gemini Computer Vision & ANPR JSON Output Card */}
              <div className="bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      Step 2 • Gemini 2.5 Flash Strict JSON Response
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      AI Waste Severity &amp; Karnataka RTO License Plate Extraction
                    </h3>
                  </div>
                </div>

                {lastAiResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Confidence</div>
                        <div className="text-base font-extrabold text-emerald-400">
                          {Math.round((lastAiResult.confidence_score || 0.96) * 100)}%
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Severity</div>
                        <div className="text-base font-extrabold text-amber-400">
                          {lastAiResult.severity}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Est. Volume</div>
                        <div className="text-base font-extrabold text-white">
                          {lastAiResult.estimated_volume_kg} kg
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">ANPR Plate</div>
                        <div className="text-sm font-mono font-black text-yellow-400">
                          {lastAiResult.license_plate || 'NONE'}
                        </div>
                      </div>
                    </div>

                    <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                      {JSON.stringify(lastAiResult, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-mono text-slate-400">
                    <div className="text-slate-500 mb-1">// Click &quot;Analyze with Gemini AI&quot; to inspect live JSON response:</div>
                    {JSON.stringify(
                      {
                        is_valid_waste: true,
                        confidence_score: activePreset.confidenceScore,
                        waste_category: activePreset.wasteCategory,
                        severity: activePreset.severity,
                        estimated_volume_kg: activePreset.estimatedVolumeKg,
                        violator_detected: activePreset.violatorDetected,
                        license_plate: activePreset.licensePlate,
                        ai_summary: activePreset.aiSummary
                      },
                      null,
                      2
                    )}
                  </div>
                )}
              </div>

              {/* Haversine Distance Calculation & Instant E-Challan Summary */}
              {lastDispatchSummary && (
                <div className="bg-[#1E293B]/80 border border-emerald-500/50 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-emerald-400" />
                      Step 3A &amp; 3B: Automated Haversine Dispatch &amp; RTO E-Challan Result
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">
                      SLA 02:00:00 STARTED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-[11px] text-slate-400 font-semibold">
                        Nearest BBMP Compactor Dispatched
                      </div>
                      <div className="text-base font-extrabold text-emerald-400 mt-0.5">
                        🚛 {lastDispatchSummary.nearestTruck?.truck_number} ({lastDispatchSummary.nearestTruck?.distanceKm} km away)
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        Driver: {lastDispatchSummary.nearestTruck?.driver_name} • {lastDispatchSummary.nearestTruck?.bbmp_zone}
                      </div>
                    </div>

                    {lastDispatchSummary.challan ? (
                      <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/50">
                        <div className="text-[11px] text-rose-300 font-bold uppercase">
                          🚨 Instant Karnataka RTO E-Challan Issued
                        </div>
                        <div className="text-base font-extrabold text-white mt-0.5">
                          {lastDispatchSummary.challan.license_plate} — ₹{lastDispatchSummary.challan.fine_amount.toLocaleString('en-IN')}
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] text-slate-300">
                            Owner: {lastDispatchSummary.challan.owner_name}
                          </span>
                          <button
                            onClick={() => setSelectedChallanModal(lastDispatchSummary.challan)}
                            className="px-2 py-0.5 rounded bg-rose-500 text-white text-[11px] font-bold"
                          >
                            View Ticket
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-center">
                        <div className="text-xs font-bold text-slate-300">
                          No Dumping Vehicle in Frame
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Logged for 200m Black-Spot Hotspot monitoring.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 3: BMTC BUS & BBMP TRUCK CAMERA SIMULATOR
        ================================================================== */}
        {activeTab === 'bmtc' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Active BMTC Vajra Bus Routes & Dashcam HUD */}
            <div className="lg:col-span-7 bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    BMTC Vajra / Astra Edge AI Fleet
                  </span>
                  <h2 className="text-lg font-extrabold text-white mt-1">
                    BMTC Bus Dashcam Automated Dumpsite &amp; Violator Detection
                  </h2>
                  <p className="text-xs text-slate-400">
                    Moving BMTC buses scan Bengaluru corridors continuously without waiting for citizen complaints
                  </p>
                </div>

                <button
                  onClick={() => setIsAutoPatrolActive((prev) => !prev)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 border transition ${
                    isAutoPatrolActive
                      ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isAutoPatrolActive ? (
                    <>
                      <Pause className="w-4 h-4" /> Stop Auto-Patrol
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-emerald-400" /> Start Live Auto-Patrol
                    </>
                  )}
                </button>
              </div>

              {/* Route Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bmtcBuses.map((bus) => {
                  const isSelected = bus.id === selectedBusId;
                  const linkedScen = PRESET_SCENARIOS[bus.linkedScenarioIndex];
                  return (
                    <div
                      key={bus.id}
                      onClick={() => setSelectedBusId(bus.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-400 shadow-md'
                          : 'bg-slate-900/75 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-blue-300 flex items-center gap-1.5">
                          <Bus className="w-4 h-4" />
                          {bus.routeCode}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                          {bus.busNumber}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white mt-1.5">{bus.corridor}</div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                        <span>Speed: {bus.speedKmh} km/h</span>
                        <span className="text-amber-300 font-mono">
                          Next Target: {linkedScen.licensePlate || 'Roadside Heap'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Simulated Live BMTC Dashcam Feed */}
              {(() => {
                const activeBus = bmtcBuses.find((b) => b.id === selectedBusId) || bmtcBuses[0];

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-slate-300">Live Edge Camera View</span>
                    </div>

                    <div className="relative rounded-xl overflow-hidden border-2 border-blue-500/40 bg-slate-950 flex flex-col items-center justify-center min-h-[16rem] sm:min-h-[18rem]">
                      <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${isWebcamActive ? 'block' : 'hidden'}`} />
                      <canvas ref={canvasRef} className="hidden" />
                      
                      {isWebcamActive ? (
                        <>
                          <div className="absolute top-3 left-3 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg flex items-center gap-1.5 animate-pulse z-10">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" /> LIVE REC
                          </div>
                          <button
                            onClick={toggleWebcam}
                            className="absolute top-3 right-3 px-2.5 py-1 rounded bg-slate-900/80 text-white text-[10px] font-bold border border-slate-700 hover:bg-slate-800 z-10 transition"
                          >
                            Stop Camera
                          </button>
                        </>
                      ) : (
                        <div className="z-10 flex flex-col items-center p-6 text-center">
                          <Camera className="w-12 h-12 text-slate-600 mb-3" />
                          <p className="text-sm font-semibold text-slate-300 mb-4">Laptop Camera Offline</p>
                          <button
                            onClick={toggleWebcam}
                            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
                          >
                            <Play className="w-4 h-4" /> Start Live Webcam Feed
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      disabled={isAnalyzingAi || !isWebcamActive}
                      onClick={() => handleSimulateBmtcCapture(activeBus)}
                      className={`w-full py-3.5 px-5 rounded-xl font-black text-sm shadow-lg transition flex items-center justify-center gap-2 ${
                        isWebcamActive && !isAnalyzingAi
                          ? 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-400 hover:to-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <Camera className="w-5 h-5" />
                      <span>
                        {isWebcamActive 
                           ? `Capture Frame (${activeBus.routeCode}) → Auto-Dispatch & E-Challan`
                           : 'Webcam Required for AI Capture'}
                      </span>
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Right 5 Cols: Live BMTC Telemetry & Automated Detection Feed */}
            <div className="lg:col-span-5 bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5 flex flex-col">
              <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                BMTC Edge-AI Telemetry Log
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Real-time stream of roadside waste &amp; violator captures from moving BMTC buses
              </p>

              <div className="flex-1 space-y-3 overflow-y-auto">
                {bmtcScanLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-blue-400">{entry.bus}</span>
                      <span className="font-mono text-slate-400">{entry.time}</span>
                    </div>
                    <div className="text-xs font-bold text-white">{entry.ward}</div>
                    <div className="text-xs text-emerald-300 font-medium">{entry.result}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 4: KARNATAKA RTO ANPR & AUTOMATED E-CHALLAN PORTAL
        ================================================================== */}
        {activeTab === 'rto' && (
          <div className="space-y-6">
            {/* Issued E-Challans Table */}
            <div className="bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Step 3B • Karnataka RTO &amp; BBMP Solid Waste Enforcement
                  </span>
                  <h2 className="text-lg font-extrabold text-white mt-1">
                    Automated ANPR Civil Penalty &amp; E-Challan Notices
                  </h2>
                  <p className="text-xs text-slate-400">
                    ₹2,500 fine for first-time illegal dumping; ₹5,000 fine for repeat offenders in Karnataka RTO registry
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={rtoSearchQuery}
                    onChange={(e) => setRtoSearchQuery(e.target.value)}
                    placeholder="Search KA Plate, Owner or Challan ID..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {challans
                  .filter(
                    (c) =>
                      !rtoSearchQuery ||
                      c.license_plate?.toLowerCase().includes(rtoSearchQuery.toLowerCase()) ||
                      c.owner_name?.toLowerCase().includes(rtoSearchQuery.toLowerCase()) ||
                      c.challan_number?.toLowerCase().includes(rtoSearchQuery.toLowerCase())
                  )
                  .map((chal) => (
                    <div
                      key={chal.id}
                      className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/50 transition flex flex-col sm:flex-row gap-4"
                    >
                      <img
                        src={chal.evidence_image_url}
                        alt={chal.license_plate}
                        className="w-full sm:w-36 h-28 object-cover rounded-xl border border-slate-700 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-rose-400">
                              {chal.challan_number}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-mono font-black text-xs">
                              IND {chal.license_plate}
                            </span>
                          </div>

                          <div className="text-sm font-extrabold text-white mt-1">
                            {chal.owner_name}{' '}
                            <span className="text-xs font-normal text-slate-400">
                              ({chal.rto_zone || 'KA Bengaluru RTO'})
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-0.5">{chal.ward_name}</div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                          <div>
                            <span className="text-lg font-black text-rose-400">
                              ₹{Number(chal.fine_amount).toLocaleString('en-IN')}
                            </span>
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {chal.prior_offenses >= 1 ? 'Repeat Offender' : '1st Offense'}
                            </span>
                          </div>

                          <button
                            onClick={() => setSelectedChallanModal(chal)}
                            className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition flex items-center gap-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Official E-Challan Notice
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Karnataka RTO Mock Vehicle Registry Database Table */}
            <div className="bg-[#1E293B]/80 border border-slate-700/80 rounded-2xl p-5">
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                Karnataka RTO Vehicle Registry Database (`vehicle_registry` Table)
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Used for instant ANPR owner lookup, phone/SMS notification, and repeat offender fine escalation
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">License Plate</th>
                      <th className="py-2.5 px-3">Registered Owner</th>
                      <th className="py-2.5 px-3">RTO Zone</th>
                      <th className="py-2.5 px-3">Vehicle Model &amp; Type</th>
                      <th className="py-2.5 px-3">Contact</th>
                      <th className="py-2.5 px-3">Prior Offenses</th>
                      <th className="py-2.5 px-3">Next Fine Slab</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {vehicleRegistry.map((v) => (
                      <tr key={v.license_plate} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-yellow-400 text-slate-950 font-mono font-black text-xs">
                            {v.license_plate}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-white">{v.owner_name}</td>
                        <td className="py-2.5 px-3 text-slate-300">{v.rto_zone}</td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {v.vehicle_model} ({v.vehicle_type})
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {v.owner_phone} • {v.owner_email}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              v.prior_offenses_count > 0
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {v.prior_offenses_count} Offenses
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                          {v.prior_offenses_count >= 1 ? '₹5,000 (Repeat)' : '₹2,500 (1st)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          MODAL 1: OFFICIAL BBMP / KARNATAKA RTO E-CHALLAN NOTICE
      ==================================================================== */}
      {selectedChallanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/60 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-rose-400">
                  BRUHAT BENGALURU MAHANAGARA PALIKE • KARNATAKA RTO ENFORCEMENT
                </div>
                <h3 className="text-lg font-extrabold text-white mt-0.5">
                  Official Solid Waste Management E-Challan Notice
                </h3>
                <p className="text-xs font-mono text-slate-400">
                  Challan ID: {selectedChallanModal.challan_number} • Issued:{' '}
                  {new Date(selectedChallanModal.issued_at).toLocaleString('en-IN')}
                </p>
              </div>
              <button
                onClick={() => setSelectedChallanModal(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-slate-700 h-52 bg-slate-950">
              <img
                src={selectedChallanModal.evidence_image_url}
                alt="ANPR Violation Proof"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = REAL_WASTE_PHOTOS.fallback;
                }}
              />
              <div className="absolute top-2.5 left-2.5 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1 rounded text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/40">
                ANPR VERIFIED EVIDENCE • {selectedChallanModal.ward_name}
              </div>
              <div className="absolute bottom-2.5 right-2.5 bg-yellow-400 text-slate-950 px-2.5 py-1 rounded border-2 border-slate-950 font-mono font-black text-sm shadow-xl">
                IND {selectedChallanModal.license_plate}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block">Vehicle Registration (ANPR)</span>
                <span className="font-mono font-black text-base text-yellow-400">
                  {selectedChallanModal.license_plate}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Civil Penalty Fine Amount</span>
                <span className="font-black text-lg text-rose-400">
                  ₹{Number(selectedChallanModal.fine_amount).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Registered Owner</span>
                <span className="font-bold text-white">{selectedChallanModal.owner_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">RTO Zone &amp; Contact</span>
                <span className="font-semibold text-slate-200">
                  {selectedChallanModal.rto_zone || 'KA-01 Koramangala RTO'} ({selectedChallanModal.owner_phone || '+91 99001 12233'})
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 block">Violation Location &amp; GPS</span>
                <span className="font-semibold text-emerald-300">
                  {selectedChallanModal.ward_name} ({selectedChallanModal.violation_lat}, {selectedChallanModal.violation_lng})
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setChallans((prev) =>
                    prev.map((c) =>
                      c.id === selectedChallanModal.id ? { ...c, status: 'sms_sent' } : c
                    )
                  );
                  triggerToast(
                    `SMS & WhatsApp E-Challan Sent to ${selectedChallanModal.owner_name}`,
                    `Dispatched notice ${selectedChallanModal.challan_number} via Karnataka RTO gateway.`,
                    'emerald'
                  );
                  setSelectedChallanModal(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                📲 Send SMS / WhatsApp Alert to Owner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 2: CREW RESOLUTION FLOW ("MARK SPOT CLEANED")
      ==================================================================== */}
      {cleaningReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Verify BBMP Cleanup &amp; Stop SLA Timer
              </h3>
              <button
                onClick={() => setCleaningReportModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Confirm cleanup completion for <strong>{cleaningReportModal.ward_name}</strong> by BBMP Truck{' '}
              <strong className="text-emerald-400">{cleaningReportModal.assigned_truck_number}</strong>.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div className="text-slate-400">Action Summary:</div>
              <div className="text-emerald-300 font-semibold">• Stops &lt; 2-Hour SLA Countdown Timer</div>
              <div className="text-emerald-300 font-semibold">• Attaches BBMP Verified After-Photo</div>
              <div className="text-emerald-300 font-semibold">• Frees {cleaningReportModal.assigned_truck_number} back to Available</div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCleaningReportModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkReportCleaned(cleaningReportModal)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Confirm Spot Cleaned
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 3: ZERO-FRICTION API KEYS & CONFIG MODAL
      ==================================================================== */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  Zero-Friction API Keys &amp; Cloud Config
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Saved locally in browser. Leave blank to run in Bengaluru Live Demo Mode.
                </p>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  VITE_GEMINI_API_KEY (Google Gemini 2.5 Flash Vision &amp; ANPR)
                </label>
                <input
                  type="password"
                  value={config.geminiApiKey}
                  onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  VITE_SUPABASE_URL (PostgreSQL + Realtime + Storage)
                </label>
                <input
                  type="text"
                  value={config.supabaseUrl}
                  onChange={(e) => setConfig({ ...config, supabaseUrl: e.target.value })}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  VITE_SUPABASE_ANON_KEY
                </label>
                <input
                  type="password"
                  value={config.supabaseAnonKey}
                  onChange={(e) => setConfig({ ...config, supabaseAnonKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setShowSqlModal(true);
                }}
                className="text-xs font-bold text-sky-400 hover:underline flex items-center gap-1"
              >
                <FileCode className="w-4 h-4" />
                View / Download supabase_setup.sql
              </button>

              <button
                onClick={() => {
                  localStorage.setItem('cleansweep_blr_config', JSON.stringify(config));
                  setShowConfigModal(false);
                  triggerToast('API Configuration Saved', 'Keys persisted to localStorage.', 'emerald');
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL 4: SUPABASE SQL SCHEMA VIEWER & DOWNLOADER (supabase_setup.sql)
      ==================================================================== */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-sky-400" />
                  Supabase SQL Setup File (`supabase_setup.sql`)
                </h3>
                <p className="text-xs text-slate-400">
                  Includes BBMP Trucks, Karnataka RTO Vehicle Registry, &lt; 2-Hr SLA Reports, E-Challans &amp; Bengaluru Seed Data
                </p>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300">
              {SUPABASE_SQL_SCHEMA}
            </pre>

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                  triggerToast('Copied supabase_setup.sql', 'Ready to paste into Supabase SQL Editor.', 'emerald');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4 text-sky-400" />
                Copy SQL to Clipboard
              </button>

              <button
                onClick={() => {
                  const blob = new Blob([SUPABASE_SQL_SCHEMA], { type: 'text/sql' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'supabase_setup.sql';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Download supabase_setup.sql
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
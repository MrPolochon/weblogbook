/**
 * Configuration de l'application VHF Radio.
 * 
 * L'URL Supabase et la clé anon sont les mêmes que le site WebLogbook.
 * L'URL de l'API (pour le token LiveKit) pointe vers le site Vercel.
 */

// Supabase — ces valeurs sont publiques (anon key)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://llhdagshfjtwowuqjjdh.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaGRhZ3NoZmp0d293dXFqamRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc2NTk0MTcsImV4cCI6MjA1MzIzNTQxN30.mwMOBCxHSHMbpMBVFOgjnMbX7TXuyaO_5eY9kVwumFU';

// API WebLogbook (Vercel) — pour le token LiveKit
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://weblogbook.vercel.app';

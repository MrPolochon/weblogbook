/**
 * Configuration de l'application VHF Radio.
 * 
 * L'URL Supabase et la clé anon sont les mêmes que le site WebLogbook.
 * L'URL de l'API (pour le token LiveKit) pointe vers le site Vercel.
 */

// Supabase — ces valeurs sont publiques (anon key)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iajcynzzybkomaouxwji.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhamN5bnp6eWJrb21hb3V4d2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTkwMDQsImV4cCI6MjA4NDMzNTAwNH0.L4lkhc64EMP7Al3_s5JLipUdy5TbbHiz92UaALm8nuE';

// API WebLogbook (Vercel) — pour le token LiveKit
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://www.mixouairlinesptfsweblogbook.com';

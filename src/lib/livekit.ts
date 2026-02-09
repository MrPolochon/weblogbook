// Configuration LiveKit
// Ces valeurs doivent être définies dans les variables d'environnement

export const LIVEKIT_CONFIG = {
  // URL du serveur LiveKit Cloud (ex: wss://xxx.livekit.cloud)
  url: process.env.NEXT_PUBLIC_LIVEKIT_URL || '',
  
  // API Key (côté serveur uniquement)
  apiKey: process.env.LIVEKIT_API_KEY || '',
  
  // API Secret (côté serveur uniquement)
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
};

// Vérifier si LiveKit est configuré
export const isLiveKitConfigured = () => {
  return !!(LIVEKIT_CONFIG.url && LIVEKIT_CONFIG.apiKey && LIVEKIT_CONFIG.apiSecret);
};

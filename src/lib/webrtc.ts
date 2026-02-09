// Configuration WebRTC partagée pour ATC et SIAVI
// Utilise des serveurs STUN/TURN publics fiables

export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN (très fiable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  // OpenRelay TURN (gratuit, avec credentials)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Délais optimisés
export const WEBRTC_TIMEOUTS = {
  OFFER_DELAY: 300,        // Délai avant envoi offer
  RETRY_DELAYS: [500, 1500, 3000, 5000], // Délais de retry
  ICE_TIMEOUT: 10000,      // Timeout pour la collecte ICE
  CONNECTION_TIMEOUT: 30000, // Timeout connexion totale
};

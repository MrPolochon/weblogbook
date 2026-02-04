'use client';

export default function SiaviModeBg({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div 
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{
        background: isAdmin 
          ? 'linear-gradient(180deg, #450a0a 0%, #1c1917 30%, #0c0a09 100%)'
          : 'linear-gradient(180deg, #3f0d0d 0%, #1a1616 30%, #0f0d0d 100%)',
      }}
    >
      {/* Motif subtil */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, #ef4444 0%, transparent 50%),
                           radial-gradient(circle at 75% 75%, #dc2626 0%, transparent 50%)`,
        }}
      />
    </div>
  );
}

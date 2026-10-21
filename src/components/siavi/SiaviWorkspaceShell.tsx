'use client';
import { usePathname } from 'next/navigation';
export default function SiaviWorkspaceShell({children}:{children:React.ReactNode}) {
 const medevac=usePathname().startsWith('/siavi/medevac');
 return <div className={medevac?'siavi-flight-space min-h-dvh flex flex-col':'min-h-dvh flex flex-col'}>{children}</div>;
}

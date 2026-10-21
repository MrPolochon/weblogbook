import SiaviFlightConsole from '@/components/siavi/SiaviFlightConsole';
export default function SiaviPlanPage({params}:{params:Promise<{id:string}>}) { return <SiaviFlightConsole params={params} />; }

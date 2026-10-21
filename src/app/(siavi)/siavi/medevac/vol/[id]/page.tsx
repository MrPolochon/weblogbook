import SiaviFlightConsole from '@/components/siavi/SiaviFlightConsole';
export default function MedevacFlightPage({ params }: { params: Promise<{id:string}> }) { return <SiaviFlightConsole params={params} medevacOnly />; }

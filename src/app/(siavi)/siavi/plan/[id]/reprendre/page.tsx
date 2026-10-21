import { redirect } from 'next/navigation';
export default async function Resume({params}:{params:Promise<{id:string}>}) { const {id}=await params; redirect(`/siavi/medevac/vol/${id}/reprendre`); }

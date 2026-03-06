import { redirect } from 'next/navigation';

/**
 * La consultation des IP est intégrée dans Admin > Sécurité.
 * Redirection pour conserver les anciens liens /admin/ips.
 */
export default function AdminIpsPage() {
  redirect('/admin/securite');
}
